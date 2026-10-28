import type { ErrorWindow, Landmark, PoseFrame, ScoreBreakdown } from "@letsdance/contracts";

export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28], [27, 29], [29, 31], [28, 30], [30, 32],
];

const JOINTS: Record<string, readonly [number, number, number]> = {
  leftElbow: [11, 13, 15],
  rightElbow: [12, 14, 16],
  leftShoulder: [13, 11, 23],
  rightShoulder: [14, 12, 24],
  leftHip: [11, 23, 25],
  rightHip: [12, 24, 26],
  leftKnee: [23, 25, 27],
  rightKnee: [24, 26, 28],
};

const LABELS: Record<string, string> = {
  leftElbow: "left arm",
  rightElbow: "right arm",
  leftShoulder: "left shoulder",
  rightShoulder: "right shoulder",
  leftHip: "left hip",
  rightHip: "right hip",
  leftKnee: "left knee",
  rightKnee: "right knee",
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function angleDegrees(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const magA = Math.hypot(ab.x, ab.y, ab.z);
  const magC = Math.hypot(cb.x, cb.y, cb.z);
  if (magA < 1e-6 || magC < 1e-6) return 0;
  return Math.acos(clamp(dot / (magA * magC), -1, 1)) * 180 / Math.PI;
}

export function normalizeLandmarks(landmarks: Landmark[], mirrored = false): Landmark[] {
  if (landmarks.length !== 33) return landmarks;
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const centerX = (leftHip.x + rightHip.x) / 2;
  const centerY = (leftHip.y + rightHip.y) / 2;
  const centerZ = (leftHip.z + rightHip.z) / 2;
  const shoulderWidth = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
  const torso = Math.hypot(
    (leftShoulder.x + rightShoulder.x) / 2 - centerX,
    (leftShoulder.y + rightShoulder.y) / 2 - centerY,
  );
  const scale = Math.max(shoulderWidth, torso, 1e-4);

  const normalized = landmarks.map((point) => ({
    x: ((mirrored ? 2 * centerX - point.x : point.x) - centerX) / scale,
    y: (point.y - centerY) / scale,
    z: (point.z - centerZ) / scale,
    visibility: point.visibility,
  }));

  if (!mirrored) return normalized;
  const pairs = [[11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
  for (const [left, right] of pairs) {
    [normalized[left], normalized[right]] = [normalized[right], normalized[left]];
  }
  return normalized;
}

export function enrichPoseFrame(frame: PoseFrame, previous?: PoseFrame): PoseFrame {
  const normalized = normalizeLandmarks(frame.landmarks);
  const jointAngles: Record<string, number> = {};
  for (const [name, [a, b, c]] of Object.entries(JOINTS)) {
    jointAngles[name] = angleDegrees(normalized[a], normalized[b], normalized[c]);
  }
  const motionEnergy = previous?.landmarks.length === 33
    ? normalized.reduce((sum, point, index) => {
      const prev = normalizeLandmarks(previous.landmarks)[index];
      return sum + Math.hypot(point.x - prev.x, point.y - prev.y, point.z - prev.z) * point.visibility;
    }, 0) / 33
    : 0;
  return { ...frame, landmarks: normalized, jointAngles, motionEnergy };
}

export function poseDistance(reference: PoseFrame, attempt: PoseFrame): number {
  const ref = Object.keys(reference.jointAngles).length ? reference : enrichPoseFrame(reference);
  const att = Object.keys(attempt.jointAngles).length ? attempt : enrichPoseFrame(attempt);
  const differences = Object.keys(JOINTS).map((joint) => Math.abs((ref.jointAngles[joint] ?? 0) - (att.jointAngles[joint] ?? 0)) / 180);
  const angleDistance = Math.sqrt(differences.reduce((sum, value) => sum + value * value, 0) / differences.length);
  const landmarkDistance = ref.landmarks.reduce((sum, point, index) => {
    const other = att.landmarks[index];
    const weight = Math.min(point.visibility, other?.visibility ?? 0);
    if (!other || weight < 0.35) return sum;
    return sum + Math.hypot(point.x - other.x, point.y - other.y, point.z - other.z) * weight;
  }, 0) / 33;
  return angleDistance * 0.7 + Math.min(1, landmarkDistance) * 0.3;
}

export function constrainedDtw(reference: PoseFrame[], attempt: PoseFrame[], bandRatio = 0.15): Array<[number, number]> {
  if (!reference.length || !attempt.length) return [];
  const n = reference.length;
  const m = attempt.length;
  const band = Math.max(Math.abs(n - m), Math.ceil(Math.max(n, m) * bandRatio));
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Number.POSITIVE_INFINITY));
  const parent = new Map<string, [number, number]>();
  cost[0][0] = 0;
  for (let i = 1; i <= n; i += 1) {
    const center = Math.round(i * m / n);
    const start = Math.max(1, center - band);
    const end = Math.min(m, center + band);
    for (let j = start; j <= end; j += 1) {
      const candidates: Array<[number, number, number]> = [
        [cost[i - 1][j], i - 1, j],
        [cost[i][j - 1], i, j - 1],
        [cost[i - 1][j - 1], i - 1, j - 1],
      ];
      candidates.sort((a, b) => a[0] - b[0]);
      cost[i][j] = poseDistance(reference[i - 1], attempt[j - 1]) + candidates[0][0];
      parent.set(`${i}:${j}`, [candidates[0][1], candidates[0][2]]);
    }
  }
  const path: Array<[number, number]> = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1]);
    [i, j] = parent.get(`${i}:${j}`) ?? [i - 1, j - 1];
  }
  return path.reverse();
}

export function compareJoint(reference: PoseFrame, attempt: PoseFrame): ErrorWindow | null {
  const ref = Object.keys(reference.jointAngles).length ? reference : enrichPoseFrame(reference);
  const att = Object.keys(attempt.jointAngles).length ? attempt : enrichPoseFrame(attempt);
  let worst: { joint: string; delta: number } | null = null;
  for (const joint of Object.keys(JOINTS)) {
    const delta = Math.abs((ref.jointAngles[joint] ?? 0) - (att.jointAngles[joint] ?? 0));
    if (!worst || delta > worst.delta) worst = { joint, delta };
  }
  if (!worst || worst.delta < 18) return null;
  const bodyPart = LABELS[worst.joint] ?? worst.joint;
  const needsExtension = (att.jointAngles[worst.joint] ?? 0) < (ref.jointAngles[worst.joint] ?? 0);
  return {
    startMs: attempt.timestampMs,
    endMs: attempt.timestampMs + 500,
    bodyPart,
    metric: `${worst.joint}AngleDeltaDeg`,
    value: Math.round(worst.delta),
    severity: clamp(worst.delta / 60, 0, 1),
    message: `${needsExtension ? "Extend" : "Soften"} your ${bodyPart}.`,
  };
}

export function calculateScore(reference: PoseFrame[], attempt: PoseFrame[]): ScoreBreakdown {
  const ref = reference.map((frame, index) => enrichPoseFrame(frame, reference[index - 1]));
  const att = attempt.map((frame, index) => enrichPoseFrame(frame, attempt[index - 1]));
  const path = constrainedDtw(ref, att);
  if (!path.length) {
    return { pose: 0, timing: 0, completion: 0, overall: 0, bodyParts: {}, errorWindows: [] };
  }
  const distances = path.map(([r, a]) => poseDistance(ref[r], att[a]));
  const meanDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;
  const sortedDistances = [...distances].sort((a, b) => a - b);
  const persistentDistance = sortedDistances[Math.floor((sortedDistances.length - 1) * 0.9)] ?? meanDistance;
  // A persistent bad window should matter even when the rest of the take is good. The
  // small dead-zone prevents ordinary landmark jitter from dominating the result.
  const posePenalty = meanDistance * 10 + Math.max(0, persistentDistance - 0.015) * 20;
  const pose = clamp(100 * (1 - Math.min(1, posePenalty)));
  const durationRef = Math.max(1, ref.at(-1)!.timestampMs - ref[0].timestampMs);
  const durationAtt = Math.max(1, att.at(-1)!.timestampMs - att[0].timestampMs);
  const timing = clamp(100 - Math.abs(durationRef - durationAtt) / durationRef * 100);
  const completion = clamp(att.length / ref.length * 100);
  const errors = path
    .map(([r, a]) => compareJoint(ref[r], att[a]))
    .filter((value): value is ErrorWindow => Boolean(value))
    .sort((a, b) => b.severity - a.severity)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.bodyPart === item.bodyPart && Math.abs(candidate.startMs - item.startMs) < 750) === index)
    .slice(0, 5);

  const bodyParts: Record<string, number> = {};
  for (const joint of Object.keys(JOINTS)) {
    const deltas = path.map(([r, a]) => Math.abs((ref[r].jointAngles[joint] ?? 0) - (att[a].jointAngles[joint] ?? 0)));
    bodyParts[LABELS[joint]] = Math.round(clamp(100 - deltas.reduce((sum, value) => sum + value, 0) / deltas.length * 1.5));
  }
  return {
    pose: Math.round(pose),
    timing: Math.round(timing),
    completion: Math.round(completion),
    overall: Math.round(pose * 0.6 + timing * 0.3 + completion * 0.1),
    bodyParts,
    errorWindows: errors,
  };
}

export function verifyRetryCorrection(
  baseline: ErrorWindow,
  retryErrors: ErrorWindow[],
  minimumImprovement = 10,
) {
  const retryError = retryErrors.find((error) => error.metric === baseline.metric);
  const metricScore = (value: number) => Math.round(clamp(100 - Math.abs(value) * 1.125));
  const before = metricScore(baseline.value);
  const after = metricScore(retryError?.value ?? 0);
  const improvement = after - before;
  return { before, after, improvement, verified: improvement >= minimumImprovement };
}

export function createDemoTimeline(durationMs = 16_000, fps = 10): PoseFrame[] {
  const frames: PoseFrame[] = [];
  const count = Math.floor(durationMs / 1000 * fps);
  for (let index = 0; index < count; index += 1) {
    const t = index / fps;
    const sway = Math.sin(t * Math.PI) * 0.08;
    const raise = Math.sin(t * Math.PI * 0.5) * 0.18;
    const landmarks = Array.from({ length: 33 }, (_, pointIndex) => ({
      x: 0.5 + ((pointIndex % 3) - 1) * 0.025 + sway,
      y: 0.16 + pointIndex / 42,
      z: Math.sin(t + pointIndex) * 0.01,
      visibility: 0.98,
    }));
    landmarks[11] = { x: 0.43 + sway, y: 0.34, z: 0, visibility: 1 };
    landmarks[12] = { x: 0.57 + sway, y: 0.34, z: 0, visibility: 1 };
    landmarks[13] = { x: 0.34 + sway, y: 0.36 - raise, z: 0, visibility: 1 };
    landmarks[14] = { x: 0.66 + sway, y: 0.38 + raise * 0.2, z: 0, visibility: 1 };
    landmarks[15] = { x: 0.24 + sway, y: 0.38 - raise * 1.2, z: 0, visibility: 1 };
    landmarks[16] = { x: 0.76 + sway, y: 0.45, z: 0, visibility: 1 };
    landmarks[23] = { x: 0.46 + sway, y: 0.58, z: 0, visibility: 1 };
    landmarks[24] = { x: 0.54 + sway, y: 0.58, z: 0, visibility: 1 };
    landmarks[25] = { x: 0.44 + sway, y: 0.74, z: 0, visibility: 1 };
    landmarks[26] = { x: 0.58 + sway, y: 0.74, z: 0, visibility: 1 };
    landmarks[27] = { x: 0.40 + sway, y: 0.92, z: 0, visibility: 1 };
    landmarks[28] = { x: 0.62 + sway, y: 0.92, z: 0, visibility: 1 };
    frames.push(enrichPoseFrame({ timestampMs: index * 1000 / fps, landmarks, jointAngles: {}, motionEnergy: 0 }, frames.at(-1)));
  }
  return frames;
}
