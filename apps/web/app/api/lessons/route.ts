import { randomUUID } from "node:crypto";
import { LessonManifestSchema, PoseFrameSchema, type LessonManifest, type PoseFrame } from "@letsdance/contracts";
import { createDemoTimeline } from "@letsdance/motion-core";
import { fallbackSegments, proposeSegments } from "@/lib/lesson";
import { normalizeVideo } from "@/lib/media";
import { compileWithMuse, deleteMetaVideo, metaIsConfigured, trackWithSam, uploadMetaVideo } from "@/lib/meta";
import { putLesson } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 180;

function parseTimeline(raw: FormDataEntryValue | null, durationMs: number): PoseFrame[] {
  try {
    const parsed = PoseFrameSchema.array().parse(JSON.parse(String(raw)));
    const sourceDuration = parsed.at(-1)?.timestampMs || durationMs;
    const ratio = durationMs / sourceDuration;
    return parsed.map((frame) => ({ ...frame, timestampMs: Math.min(durationMs, Math.round(frame.timestampMs * ratio)) }));
  } catch {
    const demo = createDemoTimeline(durationMs, 10);
    return demo;
  }
}

export async function POST(request: Request) {
  let normalized: Awaited<ReturnType<typeof normalizeVideo>> | undefined;
  let metaFileId: string | undefined;
  try {
    const form = await request.formData();
    const video = form.get("video");
    if (!(video instanceof File)) return Response.json({ error: "A video file is required." }, { status: 400 });
    normalized = await normalizeVideo(video);
    const timeline = parseTimeline(form.get("poseTimeline"), normalized.durationMs);
    const candidates = proposeSegments(timeline, normalized.durationMs);
    const allowMeta = form.get("allowMeta") === "true";
    let title = video.name.replace(/\.[^.]+$/, "") || "Your dance lesson";
    let segments = fallbackSegments(candidates);
    let samEvidence: LessonManifest["samEvidence"] = { mode: "demo", label: "Local pose evidence; Meta analysis not requested", representativeBoxes: [] };

    if (allowMeta && metaIsConfigured()) {
      try {
        metaFileId = await uploadMetaVideo(normalized.outputPath);
        const [compiled, tracked] = await Promise.all([
          compileWithMuse(metaFileId, candidates),
          trackWithSam(metaFileId),
        ]);
        title = compiled.title;
        segments = compiled.segments;
        samEvidence = tracked;
      } catch (error) {
        samEvidence = { mode: "demo", label: `Meta unavailable; local fallback used (${error instanceof Error ? error.message : "request failed"})`, representativeBoxes: [] };
      }
    } else if (allowMeta) {
      samEvidence = { mode: "demo", label: "Meta key is not configured; local fallback used", representativeBoxes: [] };
    }

    const lesson = LessonManifestSchema.parse({
      id: randomUUID(), version: 1, title, status: "ready", durationMs: normalized.durationMs,
      mirrored: false, poseTimeline: timeline, segments, samEvidence, createdAt: new Date().toISOString(),
    });
    putLesson(lesson);
    return Response.json({ lesson });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Lesson compilation failed." }, { status: 400 });
  } finally {
    if (metaFileId) await deleteMetaVideo(metaFileId);
    if (normalized) await normalized.cleanup();
  }
}
