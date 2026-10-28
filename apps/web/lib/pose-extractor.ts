import "client-only";

import type { PoseFrame } from "@letsdance/contracts";
import { enrichPoseFrame } from "@letsdance/motion-core";
import { MAX_VIDEO_DURATION_SECONDS, POSE_ANALYSIS_MAX_DIMENSION } from "@/lib/video-constraints";

type WorkerMessage = {
  type: "ready" | "pose" | "error";
  frame?: PoseFrame | null;
  message?: string;
};

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadeddata" | "seeked", timeoutMs = 15_000) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Video ${eventName} timed out.`));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The browser could not decode this video."));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
    };
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function waitForWorker(worker: Worker, acceptedType: "ready" | "pose", timeoutMs = 30_000) {
  return new Promise<WorkerMessage>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Local pose analysis timed out."));
    }, timeoutMs);
    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === "error") {
        cleanup();
        reject(new Error(event.data.message || "Local pose analysis failed."));
      } else if (event.data.type === acceptedType) {
        cleanup();
        resolve(event.data);
      }
    };
    const onError = () => {
      cleanup();
      reject(new Error("The pose-analysis worker could not start."));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError, { once: true });
  });
}

async function seek(video: HTMLVideoElement, seconds: number) {
  if (Math.abs(video.currentTime - seconds) < 0.001 && video.readyState >= 2) return;
  const ready = waitForVideoEvent(video, "seeked");
  video.currentTime = seconds;
  await ready;
}

export async function extractPoseTimeline(
  file: File,
  onProgress?: (progress: number) => void,
  fps = 10,
): Promise<PoseFrame[]> {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  const worker = new Worker(new URL("../workers/pose.worker.ts", import.meta.url));
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;

  try {
    if (video.readyState < 2) await waitForVideoEvent(video, "loadeddata");
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > MAX_VIDEO_DURATION_SECONDS) {
      throw new Error("Use a readable video no longer than 60 seconds.");
    }
    const initialized = waitForWorker(worker, "ready");
    worker.postMessage({ type: "init" });
    await initialized;

    const sampleCount = Math.max(1, Math.floor(video.duration * fps));
    const rawFrames: PoseFrame[] = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const seconds = Math.min(video.duration - 0.001, index / fps);
      await seek(video, Math.max(0, seconds));
      const scale = Math.min(1, POSE_ANALYSIS_MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
      const bitmap = await createImageBitmap(video, 0, 0, video.videoWidth, video.videoHeight, {
        resizeWidth: Math.max(2, Math.round(video.videoWidth * scale)),
        resizeHeight: Math.max(2, Math.round(video.videoHeight * scale)),
        resizeQuality: "medium",
      });
      const result = waitForWorker(worker, "pose");
      worker.postMessage({ type: "frame", bitmap, timestampMs: Math.round(index * 1000 / fps) }, [bitmap]);
      const message = await result;
      if (message.frame) rawFrames.push(message.frame);
      onProgress?.((index + 1) / sampleCount);
    }

    if (rawFrames.length < Math.max(8, sampleCount * 0.5)) {
      throw new Error("A stable full-body pose was not visible in enough frames. Use one dancer, better light, and a static camera.");
    }
    return rawFrames.reduce<PoseFrame[]>((frames, frame) => {
      frames.push(enrichPoseFrame(frame, frames.at(-1)));
      return frames;
    }, []);
  } finally {
    worker.terminate();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
