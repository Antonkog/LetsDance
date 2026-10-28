"use client";

import type { PoseFrame } from "@letsdance/contracts";
import { POSE_CONNECTIONS } from "@letsdance/motion-core";
import { useEffect, useRef } from "react";

type Props = {
  frame?: PoseFrame | null;
  tone?: "coral" | "cyan" | "white";
  emphasizedJoint?: string;
  className?: string;
};

const jointIndexes: Record<string, number[]> = {
  "left arm": [11, 13, 15],
  "right arm": [12, 14, 16],
  "left knee": [23, 25, 27],
  "right knee": [24, 26, 28],
};

export function drawPose(
  canvas: HTMLCanvasElement,
  frame: PoseFrame | null | undefined,
  tone: Props["tone"] = "coral",
  emphasizedJoint?: string,
) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  if (!frame?.landmarks?.length) return;
  const color = tone === "cyan" ? "#7ce9e1" : tone === "white" ? "#f8f4ec" : "#ff7354";
  const hipCenter = (frame.landmarks[23].x + frame.landmarks[24].x) / 2;
  const centered = Math.abs(hipCenter) < 0.18;
  const position = (index: number) => {
    const point = frame.landmarks[index];
    return centered
      ? { x: width / 2 + point.x * width * 0.38, y: height * 0.58 + point.y * height * 0.38 }
      : { x: (1 - point.x) * width, y: point.y * height };
  };
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(3, width / 190);
  context.shadowColor = color;
  context.shadowBlur = 12 * ratio;
  context.strokeStyle = color;
  context.globalAlpha = 0.9;
  for (const [from, to] of POSE_CONNECTIONS) {
    const a = position(from);
    const b = position(to);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
  const highlighted = emphasizedJoint ? jointIndexes[emphasizedJoint] ?? [] : [];
  for (const index of [...new Set(POSE_CONNECTIONS.flat())]) {
    const point = position(index);
    context.beginPath();
    context.fillStyle = highlighted.includes(index) ? "#ffe66a" : color;
    context.arc(point.x, point.y, highlighted.includes(index) ? 7 * ratio : 3.5 * ratio, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  context.shadowBlur = 0;
}

export function PoseCanvas({ frame, tone, emphasizedJoint, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) drawPose(canvasRef.current, frame, tone, emphasizedJoint);
  }, [frame, tone, emphasizedJoint]);
  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
