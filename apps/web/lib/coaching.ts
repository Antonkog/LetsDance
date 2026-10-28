import type { CoachingResponse, ErrorWindow } from "@letsdance/contracts";

export function fallbackCoaching(errors: ErrorWindow[]): CoachingResponse {
  const error = errors[0] ?? { startMs: 5200, endMs: 7400, bodyPart: "right arm", metric: "rightElbowAngleDeltaDeg", value: 32, severity: 0.7, message: "Extend your right arm." };
  return {
    mode: "demo",
    summary: `Focus on one measured change: ${error.message.toLowerCase()}`,
    corrections: [{
      startMs: error.startMs, endMs: error.endMs, bodyPart: error.bodyPart,
      observation: `${error.bodyPart} differs from the reference by ${Math.round(error.value)}° in the target window.`,
      instruction: error.message, evidenceMetric: error.metric, evidenceValue: error.value,
    }],
    drill: {
      startMs: error.startMs, endMs: error.endMs, speed: 0.5, repetitions: 3, holdMs: 1200,
      focus: error.bodyPart, instruction: `${error.message} Freeze at the key pose, then repeat without adding tension.`,
    },
  };
}
