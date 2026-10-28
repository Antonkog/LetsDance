import type { PoseFrame } from "@letsdance/contracts";
import { describe, expect, it } from "vitest";
import { proposeSegments } from "./lesson";

function timeline(durationMs: number): PoseFrame[] {
  return Array.from({ length: Math.floor(durationMs / 100) }, (_, index) => ({
    timestampMs: index * 100,
    landmarks: Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 })),
    jointAngles: {},
    motionEnergy: index % 5 === 0 ? 0.01 : 0.2,
  }));
}

describe("lesson segmentation", () => {
  it("keeps even very short segment boundaries strictly increasing", () => {
    const segments = proposeSegments(timeline(2_000), 2_000);
    expect(segments).toHaveLength(4);
    expect(segments.every((segment) => segment.endMs > segment.startMs)).toBe(true);
    expect(segments[0].startMs).toBe(0);
    expect(segments.at(-1)?.endMs).toBe(2_000);
  });

  it("uses four to eight segments for a one-minute lesson", () => {
    const segments = proposeSegments(timeline(60_000), 60_000);
    expect(segments.length).toBeGreaterThanOrEqual(4);
    expect(segments.length).toBeLessThanOrEqual(8);
  });
});
