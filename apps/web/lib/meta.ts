import { createReadStream } from "node:fs";
import type { CoachingResponse, ErrorWindow, LessonSegment } from "@letsdance/contracts";
import OpenAI from "openai";
import type { SegmentCandidate } from "./lesson";

const apiKey = process.env.MODEL_API_KEY;
const baseURL = process.env.META_MODEL_API_BASE_URL || "https://api.meta.ai/v1";

function client() {
  if (!apiKey) throw new Error("MODEL_API_KEY is not configured.");
  return new OpenAI({ apiKey, baseURL });
}

export function metaIsConfigured() {
  return Boolean(apiKey);
}

export async function uploadMetaVideo(path: string) {
  const result = await client().files.create({ file: createReadStream(path), purpose: "user_data" });
  return result.id;
}

export async function deleteMetaVideo(fileId: string) {
  await client().files.delete(fileId).catch(() => undefined);
}

const lessonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "segments"],
  properties: {
    title: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "focus", "instruction", "practiceSpeed"],
        properties: {
          id: { type: "string" }, title: { type: "string" }, focus: { type: "string" }, instruction: { type: "string" },
          practiceSpeed: { type: "number", enum: [0.5, 0.75, 1] },
        },
      },
    },
  },
} as const;

export async function compileWithMuse(fileId: string, candidates: SegmentCandidate[]) {
  const response = await client().responses.create({
    model: "muse-spark-1.3",
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: `Label these deterministic dance lesson segments. Preserve every id and order. Do not invent or change timestamps. Candidates: ${JSON.stringify(candidates)}` },
        { type: "input_video", file_id: fileId },
      ],
    }],
    text: { format: { type: "json_schema", name: "dance_lesson", strict: true, schema: lessonSchema } },
  } as never);
  const parsed = JSON.parse(response.output_text) as { title: string; segments: Array<Omit<LessonSegment, "startMs" | "endMs" | "keyPoseMs">> };
  const segments = candidates.map((candidate, index) => ({ ...candidate, ...parsed.segments[index], id: candidate.id }));
  return { title: parsed.title, segments };
}

function collectBoxes(value: unknown, boxes: Array<{ frame: number; x1: number; y1: number; x2: number; y2: number; confidence?: number }>) {
  if (!value || boxes.length >= 8) return;
  if (Array.isArray(value)) {
    if (value.length === 4 && value.every((item) => typeof item === "number")) {
      const [x1, y1, x2, y2] = value as number[];
      boxes.push({ frame: boxes.length, x1, y1, x2, y2 });
    } else value.forEach((item) => collectBoxes(item, boxes));
    return;
  }
  if (typeof value === "object") Object.values(value as Record<string, unknown>).forEach((item) => collectBoxes(item, boxes));
}

export async function trackWithSam(fileId: string) {
  const response = await client().responses.create({
    model: "sam-3.1",
    input: [{ role: "user", content: [{ type: "input_text", text: "Track the main person dancing through this video. Return persistent object tracking with one_bit masks and boxes." }, { type: "input_video", file_id: fileId }] }],
    metadata: { mask_encoding: "one_bit" },
  } as never);
  const representativeBoxes: Array<{ frame: number; x1: number; y1: number; x2: number; y2: number; confidence?: number }> = [];
  collectBoxes(response, representativeBoxes);
  return { mode: "meta" as const, label: "SAM 3.1 dancer track", representativeBoxes };
}

const coachingSchema = {
  type: "object", additionalProperties: false,
  required: ["summary", "corrections", "drill"],
  properties: {
    summary: { type: "string" },
    corrections: { type: "array", maxItems: 3, items: { type: "object", additionalProperties: false, required: ["startMs", "endMs", "bodyPart", "observation", "instruction", "evidenceMetric", "evidenceValue"], properties: { startMs: { type: "number" }, endMs: { type: "number" }, bodyPart: { type: "string" }, observation: { type: "string" }, instruction: { type: "string" }, evidenceMetric: { type: "string" }, evidenceValue: { type: "number" } } } },
    drill: { type: "object", additionalProperties: false, required: ["startMs", "endMs", "speed", "repetitions", "holdMs", "focus", "instruction"], properties: { startMs: { type: "number" }, endMs: { type: "number" }, speed: { type: "number", enum: [0.5, 0.75, 1] }, repetitions: { type: "integer" }, holdMs: { type: "integer" }, focus: { type: "string" }, instruction: { type: "string" } } },
  },
} as const;

export async function coachWithMuse(errors: ErrorWindow[], fileId?: string): Promise<CoachingResponse> {
  const response = await client().responses.create({
    model: "muse-spark-1.3",
    input: fileId ? [{
      role: "user",
      content: [
        { type: "input_text", text: `Create a concise corrective dance micro-drill using only these measured errors. Do not change timestamps or values and do not infer health or artistic quality: ${JSON.stringify(errors.slice(0, 3))}` },
        { type: "input_video", file_id: fileId },
      ],
    }] : `Create a concise corrective dance micro-drill using only these measured errors. Do not change timestamps or values and do not infer health or artistic quality: ${JSON.stringify(errors.slice(0, 3))}`,
    text: { format: { type: "json_schema", name: "grounded_coaching", strict: true, schema: coachingSchema } },
  } as never);
  return { mode: "meta", ...JSON.parse(response.output_text) } as CoachingResponse;
}
