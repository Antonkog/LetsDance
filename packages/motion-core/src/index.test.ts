import { describe, expect, it } from "vitest";
import { calculateScore, createDemoTimeline, normalizeLandmarks, verifyRetryCorrection } from "./index";

describe("motion scoring", () => {
  it("scores an identical sequence near 100", () => {
    const reference = createDemoTimeline(4000, 10);
    const score = calculateScore(reference, reference);
    expect(score.pose).toBeGreaterThanOrEqual(99);
    expect(score.overall).toBeGreaterThanOrEqual(99);
  });

  it("penalizes a persistent right-arm error", () => {
    const reference = createDemoTimeline(4000, 10);
    const attempt = structuredClone(reference);
    for (const frame of attempt.slice(15, 30)) {
      frame.landmarks[16].x = frame.landmarks[14].x - 0.35;
      frame.landmarks[16].y = frame.landmarks[14].y + 0.38;
      frame.landmarks[16].z = frame.landmarks[14].z;
      frame.jointAngles = {};
    }
    const score = calculateScore(reference, attempt);
    expect(score.pose).toBeLessThan(99);
    expect(score.errorWindows.some((error) => error.bodyPart.includes("right"))).toBe(true);
  });

  it("separates a correct take from an intentional arm error by 15 points", () => {
    const reference = createDemoTimeline(16_000, 10);
    const attempt = structuredClone(reference);
    for (const frame of attempt.filter((item) => item.timestampMs >= 4_800 && item.timestampMs <= 7_400)) {
      frame.landmarks[16].x = frame.landmarks[14].x + 0.2;
      frame.landmarks[16].y = frame.landmarks[14].y + 0.4;
      frame.landmarks[16].z = frame.landmarks[14].z;
      frame.jointAngles = {};
    }
    const correct = calculateScore(reference, reference);
    const incorrect = calculateScore(reference, attempt);
    expect(correct.overall - incorrect.overall).toBeGreaterThanOrEqual(15);
    expect(incorrect.errorWindows[0]?.bodyPart).toBe("right arm");
    expect(Math.abs((incorrect.errorWindows[0]?.startMs ?? 0) - 5_800)).toBeLessThanOrEqual(1000);
  });

  it("normalizes around the hips", () => {
    const frame = createDemoTimeline(1000, 1)[0];
    const normalized = normalizeLandmarks(frame.landmarks);
    expect((normalized[23].x + normalized[24].x) / 2).toBeCloseTo(0, 5);
    expect((normalized[23].y + normalized[24].y) / 2).toBeCloseTo(0, 5);
  });

  it("verifies a retry only after the target metric improves by ten points", () => {
    const baseline = {
      startMs: 500, endMs: 1200, bodyPart: "right arm", metric: "rightElbowAngleDeltaDeg",
      value: 32, severity: 0.7, message: "Extend your right arm.",
    };
    expect(verifyRetryCorrection(baseline, [])).toEqual({ before: 64, after: 100, improvement: 36, verified: true });
    expect(verifyRetryCorrection(baseline, [{ ...baseline, value: 30 }]).verified).toBe(false);
  });
});
