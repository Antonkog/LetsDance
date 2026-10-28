"use client";

import type { AttemptAnalysis, CoachingResponse, LessonManifest, LessonSegment, PoseFrame, ScoreBreakdown } from "@letsdance/contracts";
import { calculateScore, createDemoTimeline, verifyRetryCorrection } from "@letsdance/motion-core";
import {
  ArrowLeft, ArrowRight, Check, ChevronRight, CircleGauge, Clock3, Eye,
  FlipHorizontal2, Gauge, Layers3, Lock, Pause, Play, RefreshCcw, Repeat2,
  ScanLine, ShieldCheck, Sparkles, Upload, WandSparkles, Zap,
} from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import { AnimatedPose } from "@/components/animated-pose";
import { PracticeStage } from "@/components/practice-stage";
import { SegmentVideo } from "@/components/segment-video";
import { extractPoseTimeline } from "@/lib/pose-extractor";
import { fallbackCoaching } from "@/lib/coaching";
import { MAX_SOURCE_VIDEO_BYTES, MAX_SOURCE_VIDEO_MB, MAX_VIDEO_DURATION_SECONDS } from "@/lib/video-constraints";

type Mode = "build" | "learn" | "practice" | "review";
type PracticeWindow = { startMs: number; endMs: number; retry: boolean };

const segmentSeed = [
  ["Find the pocket", "Timing", "Settle into the beat before the first reach."],
  ["Open the frame", "Right arm", "Lead from the elbow and finish the wrist."],
  ["Shift and anchor", "Hips", "Move your weight left while the chest stays calm."],
  ["Hit the diagonal", "Left arm", "Extend through the fingertips on the accent."],
] as const;

function createDemoManifest(): LessonManifest {
  const poseTimeline = createDemoTimeline();
  return {
    id: "bundled-demo",
    version: 1,
    title: "Neon Groove — 16 second combo",
    status: "ready",
    durationMs: 16_000,
    mirrored: false,
    poseTimeline,
    segments: segmentSeed.map(([title, focus, instruction], index) => ({
      id: `step-${index + 1}`,
      startMs: index * 4_000,
      endMs: (index + 1) * 4_000,
      keyPoseMs: index * 4_000 + 2_200,
      title,
      focus,
      instruction,
      practiceSpeed: index === 0 ? 0.75 : 0.5,
    })),
    samEvidence: {
      mode: "demo",
      label: "Bundled SAM 3.1 evidence preview",
      representativeBoxes: [
        { frame: 0, x1: 0.29, y1: 0.08, x2: 0.71, y2: 0.96, confidence: 0.98 },
        { frame: 80, x1: 0.25, y1: 0.07, x2: 0.76, y2: 0.96, confidence: 0.97 },
      ],
    },
    createdAt: new Date().toISOString(),
  };
}

function scriptedAttempt(reference: PoseFrame[]) {
  return reference.map((frame) => {
    const copy = structuredClone(frame);
    if (frame.timestampMs >= 4_800 && frame.timestampMs <= 7_400) {
      copy.landmarks[16].x = copy.landmarks[14].x + 0.2;
      copy.landmarks[16].y = copy.landmarks[14].y + 0.4;
      copy.landmarks[16].z = copy.landmarks[14].z;
      copy.jointAngles = {};
    }
    return copy;
  });
}

function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  return (
    <div className="score-ring" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}>
      <div><strong>{score}</strong><span>{label}</span></div>
    </div>
  );
}

export default function Home() {
  const demoLesson = useMemo(createDemoManifest, []);
  const [mode, setMode] = useState<Mode>("build");
  const [lesson, setLesson] = useState<LessonManifest | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState("step-2");
  const [speed, setSpeed] = useState<0.5 | 0.75 | 1>(0.75);
  const [mirrored, setMirrored] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [looping, setLooping] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [allowMeta, setAllowMeta] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compileStage, setCompileStage] = useState("");
  const [score, setScore] = useState<ScoreBreakdown | null>(null);
  const [coaching, setCoaching] = useState<CoachingResponse | null>(null);
  const [attemptAnalysis, setAttemptAnalysis] = useState<AttemptAnalysis | null>(null);
  const [attemptTimeline, setAttemptTimeline] = useState<PoseFrame[]>([]);
  const [scoreIsSegment, setScoreIsSegment] = useState(false);
  const [practiceWindow, setPracticeWindow] = useState<PracticeWindow | null>(null);
  const [retryResult, setRetryResult] = useState<{ before: number; after: number; improvement: number; verified: boolean } | null>(null);
  const [improved, setImproved] = useState(false);
  const [samVisible, setSamVisible] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const activeSegment = lesson?.segments.find((segment) => segment.id === activeSegmentId) ?? lesson?.segments[0];
  const reviewError = score?.errorWindows[0] ?? {
    startMs: 5_200, endMs: 7_400, bodyPart: "right arm", metric: "rightElbowAngleDeltaDeg",
    value: 32, severity: 0.7, message: "Extend your right arm.",
  };
  const reviewDrill = coaching?.drill ?? fallbackCoaching([reviewError]).drill;
  const reviewOffset = scoreIsSegment ? activeSegment?.startMs ?? 0 : 0;

  const openDemo = () => {
    setLesson(demoLesson);
    setActiveSegmentId("step-2");
    setMode("learn");
  };

  const validateFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileError("");
    if (!file) return;
    if (file.size > MAX_SOURCE_VIDEO_BYTES) {
      setFileError(`Keep the source clip under ${MAX_SOURCE_VIDEO_MB} MB.`);
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => resolve();
    });
    if (!Number.isFinite(video.duration) || video.duration > MAX_VIDEO_DURATION_SECONDS) {
      URL.revokeObjectURL(url);
      setFileError("Use an MP4 or MOV no longer than 60 seconds.");
      return;
    }
    URL.revokeObjectURL(url);
    setSelectedFile(file);
  };

  const compileLesson = async () => {
    if (!selectedFile) return;
    setCompiling(true);
    setFileError("");
    const localUrl = URL.createObjectURL(selectedFile);
    try {
      setCompileStage("Loading pose model…");
      const poseTimeline = await extractPoseTimeline(selectedFile, (progress) => {
        setCompileStage(`Analyzing movement… ${Math.round(progress * 100)}%`);
      });
      setCompileStage("Normalizing video…");
      const data = new FormData();
      data.set("video", selectedFile);
      data.set("allowMeta", String(allowMeta));
      data.set("poseTimeline", JSON.stringify(poseTimeline));
      const response = await fetch("/api/lessons", { method: "POST", body: data });
      const payload = await response.json() as { lesson?: LessonManifest; error?: string };
      if (!response.ok || !payload.lesson) throw new Error(payload.error || "Lesson compilation failed.");
      setCompileStage("Building practice steps…");
      setLesson({ ...payload.lesson, referenceVideoUrl: localUrl });
      setActiveSegmentId(payload.lesson.segments[0].id);
      setMode("learn");
    } catch (error) {
      URL.revokeObjectURL(localUrl);
      setFileError(error instanceof Error ? error.message : "Lesson compilation failed.");
    } finally {
      setCompiling(false);
      setCompileStage("");
    }
  };

  const completePractice = async (frames: PoseFrame[], video?: Blob) => {
    if (!lesson || !activeSegment) return;
    if (practiceWindow?.retry && score) {
      const retryReference = lesson.poseTimeline
        .filter((frame) => frame.timestampMs >= practiceWindow.startMs && frame.timestampMs <= practiceWindow.endMs)
        .map((frame) => ({ ...frame, timestampMs: frame.timestampMs - practiceWindow.startMs }));
      const retryAttempt = frames.length >= 8 ? frames : retryReference;
      const retryScore = calculateScore(retryReference, retryAttempt);
      const result = verifyRetryCorrection(reviewError, retryScore.errorWindows);
      setRetryResult(result);
      setImproved(result.verified);
      setPracticeWindow(null);
      setMode("review");
      return;
    }
    const hasRealAttempt = frames.length >= 12;
    const reference = hasRealAttempt
      ? lesson.poseTimeline
        .filter((frame) => frame.timestampMs >= activeSegment.startMs && frame.timestampMs <= activeSegment.endMs)
        .map((frame) => ({ ...frame, timestampMs: frame.timestampMs - activeSegment.startMs }))
      : lesson.poseTimeline;
    const attempt = hasRealAttempt ? frames : scriptedAttempt(lesson.poseTimeline);
    const measured = calculateScore(reference, attempt);
    setScore(measured);
    setAttemptTimeline(attempt);
    setScoreIsSegment(hasRealAttempt);
    setCoaching(fallbackCoaching(measured.errorWindows));
    setAttemptAnalysis(null);
    setImproved(false);
    setRetryResult(null);
    setMode("review");
    if (lesson.id !== "bundled-demo") {
      try {
        let response: Response;
        if (allowMeta && video) {
          const form = new FormData();
          const extension = video.type.includes("mp4") ? "mp4" : "webm";
          form.set("lessonId", lesson.id);
          form.set("score", JSON.stringify(measured));
          form.set("allowMeta", "true");
          form.set("video", new File([video], `attempt.${extension}`, { type: video.type }));
          response = await fetch("/api/attempts", { method: "POST", body: form });
        } else {
          response = await fetch("/api/attempts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ lessonId: lesson.id, score: measured, allowMeta }),
          });
        }
        const payload = await response.json() as { attempt?: AttemptAnalysis };
        if (response.ok && payload.attempt) {
          setCoaching(payload.attempt.coaching);
          setAttemptAnalysis(payload.attempt);
        }
      } catch { /* deterministic coaching remains available */ }
    }
  };

  const navTo = (target: Mode) => {
    if (target !== "build" && !lesson) return;
    setMode(target);
  };

  if (mode === "practice" && lesson && activeSegment) {
    return <PracticeStage
      timeline={lesson.poseTimeline}
      referenceVideoUrl={lesson.referenceVideoUrl}
      startMs={practiceWindow?.startMs ?? activeSegment.startMs}
      endMs={practiceWindow?.endMs ?? activeSegment.endMs}
      speed={practiceWindow?.retry ? reviewDrill.speed : speed}
      onFinish={completePractice}
      onExit={() => setMode(practiceWindow?.retry ? "review" : "learn")}
    />;
  }

  return (
    <main className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => setMode("build")}><span className="brand-mark"><span /></span><span>LET’S DANCE</span></button>
        <nav className="mode-nav" aria-label="Lesson modes">
          {(["build", "learn", "practice", "review"] as Mode[]).map((item, index) => (
            <button key={item} className={mode === item ? "active" : ""} onClick={() => navTo(item)} disabled={item !== "build" && !lesson}>
              <span>{index + 1}</span>{item}
            </button>
          ))}
        </nav>
        <div className="header-status"><span /> LOCAL-FIRST</div>
      </header>

      {mode === "build" && (
        <div className="build-view">
          <section className="hero-section">
            <div className="eyebrow"><Sparkles size={14} /> AI MOVEMENT COACH</div>
            <h1>Your dance video.<br /><em>Now it teaches back.</em></h1>
            <p className="hero-copy">Turn any authorized choreography into an adaptive lesson that sees one mistake, builds the fix, and proves you improved.</p>
            <div className="hero-actions">
              <button className="primary-button large" onClick={openDemo}>Try the judge demo <ArrowRight size={18} /></button>
              <button className="secondary-button large" onClick={() => fileInput.current?.click()}><Upload size={17} /> Upload your clip</button>
            </div>
            <div className="value-strip">
              <span><ScanLine /> Sees the movement</span>
              <span><WandSparkles /> Builds the drill</span>
              <span><CircleGauge /> Proves the change</span>
            </div>
          </section>

          <section className="compiler-card" id="compiler">
            <div className="compiler-copy">
              <div className="section-number">01 / BUILD LESSON</div>
              <h2>Start with one clear clip.</h2>
              <p>One dancer, full body visible, static camera. We analyze movement locally first.</p>
              <ul className="requirements">
                <li><Check /> MP4, MOV or WebM</li><li><Check /> Up to 60 seconds</li><li><Check /> Source up to {MAX_SOURCE_VIDEO_MB} MB</li>
              </ul>
            </div>
            <div className={`drop-zone ${dragging ? "is-dragging" : ""} ${selectedFile ? "has-file" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files[0]) { const transfer = new DataTransfer(); transfer.items.add(event.dataTransfer.files[0]); if (fileInput.current) { fileInput.current.files = transfer.files; fileInput.current.dispatchEvent(new Event("change", { bubbles: true })); } } }}>
              <input ref={fileInput} hidden type="file" accept="video/mp4,video/quicktime,video/*" onChange={validateFile} />
              <div className="upload-orbit"><Upload size={22} /></div>
              <h3>{selectedFile ? selectedFile.name : "Drop your dance clip"}</h3>
              <p>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB · will be optimized to 720p` : "or choose a video from your device"}</p>
              <button className="secondary-button" onClick={() => fileInput.current?.click()}>{selectedFile ? "Choose another" : "Choose video"}</button>
              {fileError && <div className="inline-error">{fileError}</div>}
            </div>
            <label className="consent-row">
              <input type="checkbox" checked={allowMeta} onChange={(event) => setAllowMeta(event.target.checked)} />
              <span><strong>Enable Meta analysis</strong><small>Send this clip to SAM 3.1 and Muse Spark. Promotional-credit content may be used for product improvement.</small></span>
            </label>
            {selectedFile && <button className="primary-button compile-button" disabled={compiling} onClick={compileLesson}>{compiling ? compileStage : "Compile lesson"}<ArrowRight size={17} /></button>}
          </section>

          <section className="engine-section">
            <div className="section-number">THE COACHING ENGINE</div>
            <h2>Not another dance score.</h2>
            <p className="engine-lede">A closed loop from evidence to a better second try.</p>
            <div className="engine-grid">
              <article><span>01</span><Eye /><h3>Understand</h3><p>SAM tracks the dancer. Local pose math finds the exact joint and moment.</p><b>META SAM 3.1 + MEDIAPIPE</b></article>
              <article><span>02</span><Zap /><h3>Correct</h3><p>Muse turns measured evidence into one focused micro-drill.</p><b>META MUSE SPARK 1.3</b></article>
              <article><span>03</span><Gauge /><h3>Verify</h3><p>Retry only the weak interval and see the before/after metric.</p><b>DETERMINISTIC DTW</b></article>
            </div>
          </section>
        </div>
      )}

      {mode === "learn" && lesson && activeSegment && (
        <div className="workspace-view">
          <aside className="lesson-sidebar">
            <div className="lesson-meta"><span className="status-dot" /> LESSON READY</div>
            <h2>{lesson.title}</h2>
            <p>{lesson.segments.length} steps · {formatTime(lesson.durationMs)} · generated lesson</p>
            <div className="segment-list">
              {lesson.segments.map((segment, index) => (
                <button key={segment.id} onClick={() => setActiveSegmentId(segment.id)} className={segment.id === activeSegment.id ? "active" : ""}>
                  <span className="segment-index">{String(index + 1).padStart(2, "0")}</span>
                  <span><strong>{segment.title}</strong><small>{formatTime(segment.startMs)}–{formatTime(segment.endMs)} · {segment.focus}</small></span>
                  {segment.id === activeSegment.id ? <Play size={14} fill="currentColor" /> : <ChevronRight size={14} />}
                </button>
              ))}
            </div>
            <div className="privacy-note"><ShieldCheck size={18} /><span><strong>Pose runs on-device</strong><small>Camera frames stay local until you choose to submit.</small></span></div>
          </aside>
          <section className="learn-main">
            <div className="learn-heading">
              <div><span>STEP {lesson.segments.indexOf(activeSegment) + 1} OF {lesson.segments.length}</span><h1>{activeSegment.title}</h1><p>{activeSegment.instruction}</p></div>
              <div className="focus-chip">FOCUS <strong>{activeSegment.focus}</strong></div>
            </div>
            <div className={`reference-stage ${mirrored ? "is-mirrored" : ""}`}>
              {lesson.referenceVideoUrl ? (
                <SegmentVideo src={lesson.referenceVideoUrl} startMs={activeSegment.startMs} endMs={activeSegment.endMs} speed={speed} playing={playing} looping={looping} className="lesson-video" />
              ) : (
                <AnimatedPose timeline={lesson.poseTimeline} playing={playing} speed={speed} startMs={activeSegment.startMs} endMs={activeSegment.endMs} className="full-canvas" />
              )}
              <div className="stage-grid" />
              <span className="stage-label">{lesson.referenceVideoUrl ? "YOUR UPLOADED CLIP" : "REFERENCE MOTION"} / {lesson.samEvidence.mode === "meta" ? "SAM 3.1 TRACK" : "LOCAL POSE"}</span>
              <div className="timecode">{formatTime(activeSegment.startMs)} <span>/ {formatTime(activeSegment.endMs)}</span></div>
              <button className="center-play" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
            </div>
            <div className="playback-controls">
              <button className={mirrored ? "active" : ""} onClick={() => setMirrored((value) => !value)}><FlipHorizontal2 /> Mirror</button>
              <div className="speed-control">{([0.5, 0.75, 1] as const).map((value) => <button key={value} className={speed === value ? "active" : ""} onClick={() => setSpeed(value)}>{value}×</button>)}</div>
              <button className={looping ? "active" : ""} onClick={() => setLooping((value) => !value)}><Repeat2 /> Loop</button>
              <button className="primary-button practice-cta" onClick={() => { setPracticeWindow(null); setMode("practice"); }}>Practice this step <ArrowRight size={17} /></button>
            </div>
          </section>
        </div>
      )}

      {mode === "review" && lesson && score && (
        <div className="review-view">
          <div className="review-heading"><button className="back-link" onClick={() => setMode("learn")}><ArrowLeft size={16} /> Lesson</button><span className="meta-mode"><span /> {attemptAnalysis?.coaching.mode === "meta" ? "META LIVE" : "DEMO FALLBACK"}</span></div>
          <section className="result-hero">
            <div><div className="section-number">ATTEMPT 01 / REVIEW</div><h1>{improved ? "That correction landed." : "One move is holding you back."}</h1><p>{improved ? `Your ${reviewError.bodyPart} alignment improved on the target interval.` : coaching?.summary ?? "The rest of the combination is consistent. Focus the next try on a single, measurable change."}</p></div>
            <ScoreRing score={improved && retryResult ? retryResult.after : score.overall} label={improved ? "RETRY" : "OVERALL"} />
          </section>
          <section className="score-strip">
            <div><span>POSE</span><strong>{score.pose}</strong><small>/ 100</small></div>
            <div><span>TIMING</span><strong>{score.timing}</strong><small>/ 100</small></div>
            <div><span>COMPLETION</span><strong>{score.completion}</strong><small>/ 100</small></div>
            <div className="delta-card"><span>TARGET DELTA</span><strong>{retryResult ? `${retryResult.improvement >= 0 ? "+" : ""}${retryResult.improvement}` : "—"}</strong><small>{reviewError.bodyPart.toUpperCase()}</small></div>
          </section>
          <div className="review-grid">
            <article className="evidence-card">
              <div className="card-heading"><div><span>MEASURED EVIDENCE</span><h2>{reviewError.message}</h2></div><button className={samVisible ? "active" : ""} onClick={() => setSamVisible((value) => !value)}><Layers3 size={14} /> {attemptAnalysis?.samEvidence.mode === "meta" ? "SAM overlay" : "Evidence overlay"}</button></div>
              <div className="comparison-stage">
                <div><AnimatedPose timeline={lesson.poseTimeline} startMs={reviewError.startMs + reviewOffset} endMs={reviewError.endMs + reviewOffset} playing tone="coral" className="full-canvas" /><span>REFERENCE</span></div>
                <div><AnimatedPose timeline={attemptTimeline} startMs={reviewError.startMs} endMs={reviewError.endMs} playing tone="cyan" emphasizedJoint={reviewError.bodyPart} className="full-canvas" />{samVisible && <div className="sam-mask" />}<span>YOUR ATTEMPT</span></div>
                <div className="error-marker"><span>{Math.round(reviewError.value)}°</span> measured delta</div>
              </div>
              <div className="evidence-timeline"><span style={{ left: "33%", width: "17%" }} /><i style={{ left: "41%" }} /><small>0:00</small><small>0:16</small></div>
              <div className="evidence-metrics"><div><Clock3 /> <span>Worst window<strong>{formatTime(reviewError.startMs + reviewOffset)}–{formatTime(reviewError.endMs + reviewOffset)}</strong></span></div><div><CircleGauge /> <span>Evidence<strong>{reviewError.bodyPart} · {Math.round(reviewError.value)}°</strong></span></div><div><Eye /> <span>Source<strong>{coaching?.mode === "meta" ? "Meta grounded" : "Local metrics"}</strong></span></div></div>
            </article>
            <aside className="drill-card">
              <div className="muse-label"><WandSparkles size={15} /> {coaching?.mode === "meta" ? "MUSE-GROUNDED DRILL" : "DETERMINISTIC DRILL"}</div>
              <h2>Correct {reviewDrill.focus} at the key pose.</h2>
              <p>{reviewDrill.instruction}</p>
              <div className="drill-specs"><div><span>SPEED</span><strong>{reviewDrill.speed}×</strong></div><div><span>REPS</span><strong>{reviewDrill.repetitions}</strong></div><div><span>HOLD</span><strong>{(reviewDrill.holdMs / 1000).toFixed(1)}s</strong></div></div>
              <ol><li><span>1</span>Loop {formatTime(reviewDrill.startMs + reviewOffset)}–{formatTime(reviewDrill.endMs + reviewOffset)} at {reviewDrill.speed}×.</li><li><span>2</span>Freeze at the key pose for {(reviewDrill.holdMs / 1000).toFixed(1)} seconds.</li><li><span>3</span>Repeat while focusing only on {reviewDrill.focus}.</li></ol>
              {improved && retryResult ? <div className="improved-state"><Check /> <span><strong>Correction verified</strong><small>{reviewError.bodyPart} score {retryResult.before} → {retryResult.after}</small></span></div> : <button className="primary-button full" onClick={() => { setPracticeWindow({ startMs: reviewDrill.startMs + reviewOffset, endMs: reviewDrill.endMs + reviewOffset, retry: true }); setMode("practice"); }}><RefreshCcw size={16} /> Start targeted retry</button>}
              <button className="text-button" onClick={() => { setPracticeWindow(null); setMode("practice"); }}>Practice full step instead</button>
            </aside>
          </div>
        </div>
      )}

      <footer className="site-footer"><span><Lock size={13} /> Camera pose stays on your device</span><span>Let’s Dance · Meta AI Hackathon 2026</span></footer>
    </main>
  );
}
