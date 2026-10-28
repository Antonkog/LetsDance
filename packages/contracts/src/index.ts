import { z } from "zod";

export const LandmarkSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  visibility: z.number().min(0).max(1).default(1),
});

export const PoseFrameSchema = z.object({
  timestampMs: z.number().nonnegative(),
  landmarks: z.array(LandmarkSchema).length(33),
  worldLandmarks: z.array(LandmarkSchema).length(33).optional(),
  jointAngles: z.record(z.string(), z.number()).default({}),
  motionEnergy: z.number().nonnegative().default(0),
});

export type Landmark = z.infer<typeof LandmarkSchema>;
export type PoseFrame = z.infer<typeof PoseFrameSchema>;

export const LessonSegmentSchema = z.object({
  id: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  title: z.string().min(1),
  focus: z.string().min(1),
  instruction: z.string().min(1),
  practiceSpeed: z.union([z.literal(0.5), z.literal(0.75), z.literal(1)]),
  keyPoseMs: z.number().nonnegative(),
});

export const LessonManifestSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  status: z.enum(["processing", "ready", "failed"]),
  durationMs: z.number().positive(),
  mirrored: z.boolean(),
  referenceVideoUrl: z.string().optional(),
  poseTimeline: z.array(PoseFrameSchema),
  segments: z.array(LessonSegmentSchema).min(1).max(12),
  samEvidence: z.object({
    mode: z.enum(["meta", "demo", "unavailable"]),
    label: z.string(),
    representativeBoxes: z.array(z.object({
      frame: z.number().int().nonnegative(),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      confidence: z.number().optional(),
    })),
  }),
  createdAt: z.string(),
});

export type LessonSegment = z.infer<typeof LessonSegmentSchema>;
export type LessonManifest = z.infer<typeof LessonManifestSchema>;

export const ErrorWindowSchema = z.object({
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  bodyPart: z.string(),
  metric: z.string(),
  value: z.number(),
  severity: z.number().min(0).max(1),
  message: z.string(),
});

export const ScoreBreakdownSchema = z.object({
  pose: z.number().min(0).max(100),
  timing: z.number().min(0).max(100),
  completion: z.number().min(0).max(100),
  overall: z.number().min(0).max(100),
  bodyParts: z.record(z.string(), z.number().min(0).max(100)),
  errorWindows: z.array(ErrorWindowSchema).max(12),
});

export type ErrorWindow = z.infer<typeof ErrorWindowSchema>;
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const MicroDrillSchema = z.object({
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  speed: z.union([z.literal(0.5), z.literal(0.75), z.literal(1)]),
  repetitions: z.number().int().min(1).max(8),
  holdMs: z.number().int().min(0).max(5000),
  focus: z.string(),
  instruction: z.string(),
});

export const CoachingResponseSchema = z.object({
  mode: z.enum(["meta", "demo"]),
  summary: z.string(),
  corrections: z.array(z.object({
    startMs: z.number().nonnegative(),
    endMs: z.number().positive(),
    bodyPart: z.string(),
    observation: z.string(),
    instruction: z.string(),
    evidenceMetric: z.string(),
    evidenceValue: z.number(),
  })).max(3),
  drill: MicroDrillSchema,
});

export type CoachingResponse = z.infer<typeof CoachingResponseSchema>;
export type MicroDrill = z.infer<typeof MicroDrillSchema>;

export const AttemptAnalysisSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  status: z.enum(["uploaded", "normalizing", "segmenting", "coaching", "complete", "failed"]),
  score: ScoreBreakdownSchema,
  coaching: CoachingResponseSchema,
  samEvidence: LessonManifestSchema.shape.samEvidence,
  createdAt: z.string(),
});

export type AttemptAnalysis = z.infer<typeof AttemptAnalysisSchema>;
