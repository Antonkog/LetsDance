"use client";

import type { PoseFrame } from "@letsdance/contracts";
import { compareJoint } from "@letsdance/motion-core";
import { Camera, Maximize2, Minimize2, Pause, Play, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatedPose } from "./animated-pose";
import { drawPose } from "./pose-canvas";
import { SegmentVideo, type SegmentVideoHandle } from "./segment-video";

export function PracticeStage({
  timeline,
  referenceVideoUrl,
  startMs,
  endMs,
  speed,
  onFinish,
  onExit,
}: {
  timeline: PoseFrame[];
  referenceVideoUrl?: string;
  startMs: number;
  endMs: number;
  speed: number;
  onFinish: (frames: PoseFrame[], video?: Blob) => void | Promise<void>;
  onExit: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const referenceVideoRef = useRef<SegmentVideoHandle>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
  const startedAt = useRef(0);
  const lastSent = useRef(0);
  const cueSince = useRef(0);
  const recordingRef = useRef(false);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "ready" | "denied">("idle");
  const [recording, setRecording] = useState(false);
  const [pipLarge, setPipLarge] = useState(false);
  const [referencePlaying, setReferencePlaying] = useState(true);
  const [referenceRun, setReferenceRun] = useState(0);
  const [cue, setCue] = useState("Match the reference, then press record.");

  const startCamera = useCallback(async () => {
    setCameraState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const worker = new Worker(new URL("../workers/pose.worker.ts", import.meta.url));
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<{ type: string; frame?: PoseFrame; message?: string }>) => {
        if (event.data.type === "pose" && event.data.frame) {
          const pose = event.data.frame;
          if (overlayRef.current) drawPose(overlayRef.current, pose, "cyan");
          if (!recordingRef.current) return;
          const relative = { ...pose, timestampMs: performance.now() - startedAt.current };
          framesRef.current.push(relative);
          const lessonTime = startMs + relative.timestampMs * speed;
          const reference = timeline.reduce((nearest, candidate) =>
            Math.abs(candidate.timestampMs - lessonTime) < Math.abs(nearest.timestampMs - lessonTime) ? candidate : nearest,
          timeline[0]);
          const error = compareJoint(reference, relative);
          if (error) {
            if (!cueSince.current) cueSince.current = performance.now();
            if (performance.now() - cueSince.current > 400) setCue(error.message);
          } else {
            cueSince.current = 0;
            setCue("On track — keep the rhythm.");
          }
        }
      };
      worker.postMessage({ type: "init" });
      setCameraState("ready");
    } catch {
      setCameraState("denied");
    }
  }, [speed, startMs, timeline]);

  useEffect(() => {
    if (cameraState !== "ready") return;
    let animation = 0;
    const sample = async (now: number) => {
      if (videoRef.current?.readyState === 4 && workerRef.current && now - lastSent.current >= 83) {
        lastSent.current = now;
        try {
          const bitmap = await createImageBitmap(videoRef.current);
          workerRef.current.postMessage({ type: "frame", bitmap, timestampMs: now }, [bitmap]);
        } catch { /* a frame may disappear while the camera closes */ }
      }
      animation = requestAnimationFrame(sample);
    };
    animation = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(animation);
  }, [cameraState]);

  useEffect(() => () => {
    if (finishTimer.current) clearTimeout(finishTimer.current);
    workerRef.current?.terminate();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startVideoRecording = () => {
    if (!streamRef.current || !("MediaRecorder" in window)) return;
    const supported = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]
      .find((type) => MediaRecorder.isTypeSupported(type));
    try {
      recordedChunks.current = [];
      const recorder = new MediaRecorder(streamRef.current, supported ? { mimeType: supported } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordedChunks.current.push(event.data);
      };
      recorder.start(250);
      recorderRef.current = recorder;
    } catch {
      recorderRef.current = null;
    }
  };

  const stopVideoRecording = () => new Promise<Blob | undefined>((resolve) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      resolve(undefined);
      return;
    }
    recorder.onstop = () => {
      const type = recorder.mimeType || recordedChunks.current[0]?.type || "video/webm";
      const blob = recordedChunks.current.length ? new Blob(recordedChunks.current, { type }) : undefined;
      recorderRef.current = null;
      resolve(blob);
    };
    recorder.stop();
  });

  const finishRecording = async () => {
    recordingRef.current = false;
    setRecording(false);
    referenceVideoRef.current?.pause();
    const video = await stopVideoRecording();
    await onFinish(framesRef.current, video);
  };

  const toggleRecording = async () => {
    if (!recording) {
      framesRef.current = [];
      cueSince.current = 0;
      setCue("Follow the reference — one cue at a time.");
      setReferencePlaying(true);
      setReferenceRun((value) => value + 1);
      startedAt.current = referenceVideoUrl
        ? await referenceVideoRef.current?.start() ?? performance.now()
        : performance.now();
      startVideoRecording();
      recordingRef.current = true;
      setRecording(true);
      finishTimer.current = setTimeout(() => void finishRecording(), Math.min(10_000, (endMs - startMs) / speed + 1200));
    } else {
      if (finishTimer.current) clearTimeout(finishTimer.current);
      await finishRecording();
    }
  };

  return (
    <section className="practice-shell">
      <div className="practice-topbar">
        <button className="quiet-button" onClick={onExit}>Close</button>
        <div className={`record-state ${recording ? "is-live" : ""}`}><span />{recording ? "RECORDING" : "PRACTICE"}</div>
        <span className="local-pill">ON-DEVICE POSE</span>
      </div>
      <div className="camera-stage">
        <video ref={videoRef} className="camera-video" muted playsInline />
        <canvas ref={overlayRef} className="camera-overlay" />
        {cameraState !== "ready" && (
          <div className="camera-gate">
            <div className="camera-icon"><Camera size={28} /></div>
            <h2>{cameraState === "denied" ? "Camera access is off" : "Ready to practice?"}</h2>
            <p>{cameraState === "denied" ? "Enable camera permission in your browser, or continue with the safe demo attempt." : "Your live pose stays on this device."}</p>
            {cameraState !== "denied" && <button className="primary-button" onClick={startCamera} disabled={cameraState === "starting"}>{cameraState === "starting" ? "Starting…" : "Enable camera"}</button>}
            <button className="text-button" onClick={() => onFinish([])}>Use scripted demo attempt</button>
          </div>
        )}
        <div className={`reference-pip ${pipLarge ? "is-large" : ""}`}>
          <div className="pip-label"><span>REFERENCE</span><button onClick={() => setPipLarge((value) => !value)} aria-label="Resize reference">{pipLarge ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button></div>
          <div className="pip-stage">
            {referenceVideoUrl ? (
              <SegmentVideo ref={referenceVideoRef} src={referenceVideoUrl} startMs={startMs} endMs={endMs} speed={speed} playing={referencePlaying} looping className="lesson-video" />
            ) : (
              <AnimatedPose key={referenceRun} timeline={timeline} startMs={startMs} endMs={endMs} speed={speed} playing={referencePlaying} tone="coral" className="full-canvas" />
            )}
          </div>
          <button className="pip-play" onClick={() => {
            setReferencePlaying((value) => {
              if (value) referenceVideoRef.current?.pause();
              else if (referenceVideoUrl) void referenceVideoRef.current?.start();
              return !value;
            });
          }} aria-label="Play or pause reference">{referencePlaying ? <Pause size={13} /> : <Play size={13} />}</button>
        </div>
        <div className="live-cue"><span className="cue-eye" /> <p>{cue}</p></div>
        {cameraState === "ready" && (
          <button className={`record-button ${recording ? "is-recording" : ""}`} onClick={toggleRecording} aria-label={recording ? "Stop recording" : "Start recording"}>
            {recording ? <Square size={24} fill="currentColor" /> : <span />}
          </button>
        )}
      </div>
    </section>
  );
}
