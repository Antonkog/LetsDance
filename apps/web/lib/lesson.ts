import type { LessonSegment, PoseFrame } from "@letsdance/contracts";

export type SegmentCandidate = Pick<LessonSegment, "id" | "startMs" | "endMs" | "keyPoseMs">;

export function proposeSegments(timeline: PoseFrame[], durationMs: number): SegmentCandidate[] {
  const targetCount = Math.max(4, Math.min(8, Math.round(durationMs / 7000)));
  const boundaries = [0];
  const nominalLength = durationMs / targetCount;
  const searchRadius = Math.min(1200, nominalLength * 0.35);
  for (let index = 1; index < targetCount; index += 1) {
    const target = durationMs * index / targetCount;
    const candidates = timeline.filter((frame) => Math.abs(frame.timestampMs - target) <= searchRadius);
    const quietest = candidates.reduce<PoseFrame | undefined>((best, frame) =>
      !best || frame.motionEnergy < best.motionEnergy ? frame : best, undefined);
    const minimumLength = Math.min(750, nominalLength * 0.5);
    const earliest = boundaries.at(-1)! + minimumLength;
    const latest = durationMs - (targetCount - index) * minimumLength;
    boundaries.push(Math.round(Math.max(earliest, Math.min(latest, quietest?.timestampMs ?? target))));
  }
  boundaries.push(durationMs);
  return boundaries.slice(0, -1).map((startMs, index) => {
    const endMs = boundaries[index + 1];
    const windowFrames = timeline.filter((frame) => frame.timestampMs >= startMs && frame.timestampMs <= endMs);
    const keyPose = windowFrames.reduce<PoseFrame | undefined>((best, frame) =>
      !best || frame.motionEnergy > best.motionEnergy ? frame : best, undefined);
    return { id: `step-${index + 1}`, startMs, endMs, keyPoseMs: Math.round(keyPose?.timestampMs ?? (startMs + endMs) / 2) };
  });
}

export function fallbackSegments(candidates: SegmentCandidate[]): LessonSegment[] {
  const names = [
    ["Find the pocket", "Timing", "Settle into the beat and make the first direction clear."],
    ["Open the frame", "Right arm", "Lead from the elbow and finish through the fingertips."],
    ["Shift and anchor", "Hips", "Move your weight while keeping the chest controlled."],
    ["Hit the diagonal", "Left arm", "Extend fully on the accent, then release."],
    ["Reset the base", "Knees", "Soften both knees before the direction change."],
    ["Finish the phrase", "Full body", "Connect the final reach to a stable landing."],
    ["Clean the transition", "Timing", "Let the previous move finish before the next begins."],
    ["Hold the picture", "Posture", "Keep the last shape still for one full count."],
  ];
  return candidates.map((candidate, index) => ({
    ...candidate,
    title: names[index][0],
    focus: names[index][1],
    instruction: names[index][2],
    practiceSpeed: index < 2 ? 0.5 : 0.75,
  } as LessonSegment));
}
