"use client";

import type { PoseFrame } from "@letsdance/contracts";
import { useEffect, useRef, useState } from "react";
import { PoseCanvas } from "./pose-canvas";

export function AnimatedPose({
  timeline,
  playing = true,
  speed = 1,
  startMs = 0,
  endMs,
  tone = "coral",
  emphasizedJoint,
  className,
}: {
  timeline: PoseFrame[];
  playing?: boolean;
  speed?: number;
  startMs?: number;
  endMs?: number;
  tone?: "coral" | "cyan" | "white";
  emphasizedJoint?: string;
  className?: string;
}) {
  const [frame, setFrame] = useState<PoseFrame | null>(timeline[0] ?? null);
  const clock = useRef(performance.now());
  useEffect(() => {
    clock.current = performance.now();
    if (!playing || !timeline.length) return;
    let animation = 0;
    const finalMs = endMs ?? timeline.at(-1)?.timestampMs ?? 0;
    const duration = Math.max(1, finalMs - startMs);
    const tick = (now: number) => {
      const position = startMs + ((now - clock.current) * speed) % duration;
      let closest = timeline[0];
      for (const candidate of timeline) {
        if (candidate.timestampMs > position) break;
        closest = candidate;
      }
      setFrame(closest);
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [timeline, playing, speed, startMs, endMs]);
  return <PoseCanvas frame={frame} tone={tone} emphasizedJoint={emphasizedJoint} className={className} />;
}
