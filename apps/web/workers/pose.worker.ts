/// <reference lib="webworker" />

import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";

declare const self: DedicatedWorkerGlobalScope;

let landmarker: PoseLandmarker | null = null;

async function initialize() {
  if (landmarker) return;
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm",
  );
  const options = {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      delegate: "GPU" as "GPU" | "CPU",
    },
    runningMode: "VIDEO" as const,
    numPoses: 1,
    minPoseDetectionConfidence: 0.55,
    minTrackingConfidence: 0.55,
  };
  try {
    landmarker = await PoseLandmarker.createFromOptions(vision, options);
  } catch {
    options.baseOptions.delegate = "CPU";
    landmarker = await PoseLandmarker.createFromOptions(vision, options);
  }
  self.postMessage({ type: "ready" });
}

function serialize(result: PoseLandmarkerResult, timestampMs: number) {
  const landmarks = result.landmarks[0]?.map((point) => ({
    x: point.x,
    y: point.y,
    z: point.z,
    visibility: point.visibility ?? 1,
  }));
  const worldLandmarks = result.worldLandmarks[0]?.map((point) => ({
    x: point.x,
    y: point.y,
    z: point.z,
    visibility: point.visibility ?? 1,
  }));
  return landmarks ? { timestampMs, landmarks, worldLandmarks, jointAngles: {}, motionEnergy: 0 } : null;
}

self.onmessage = async (event: MessageEvent<{ type: "init" } | { type: "frame"; bitmap: ImageBitmap; timestampMs: number }>) => {
  try {
    if (event.data.type === "init") {
      await initialize();
      return;
    }
    if (!landmarker) await initialize();
    const { bitmap, timestampMs } = event.data;
    const result = landmarker!.detectForVideo(bitmap, timestampMs);
    bitmap.close();
    self.postMessage({ type: "pose", frame: serialize(result, timestampMs) });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "Pose worker failed" });
  }
};

export {};
