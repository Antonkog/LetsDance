import { randomUUID } from "node:crypto";
import { AttemptAnalysisSchema, ScoreBreakdownSchema, type AttemptAnalysis } from "@letsdance/contracts";
import { fallbackCoaching } from "@/lib/coaching";
import { normalizeVideo } from "@/lib/media";
import { coachWithMuse, deleteMetaVideo, metaIsConfigured, trackWithSam, uploadMetaVideo } from "@/lib/meta";
import { getLesson, putAttempt } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  let normalized: Awaited<ReturnType<typeof normalizeVideo>> | undefined;
  let metaFileId: string | undefined;
  try {
    const multipart = request.headers.get("content-type")?.includes("multipart/form-data");
    let input: { lessonId?: string; score?: unknown; allowMeta?: boolean };
    let video: File | undefined;
    if (multipart) {
      const form = await request.formData();
      input = {
        lessonId: String(form.get("lessonId") || ""),
        score: JSON.parse(String(form.get("score") || "null")),
        allowMeta: form.get("allowMeta") === "true",
      };
      const candidate = form.get("video");
      if (candidate instanceof File) video = candidate;
    } else input = await request.json() as { lessonId?: string; score?: unknown; allowMeta?: boolean };
    if (!input.lessonId || !getLesson(input.lessonId)) return Response.json({ error: "Lesson not found or expired." }, { status: 404 });
    const score = ScoreBreakdownSchema.parse(input.score);
    let coaching = fallbackCoaching(score.errorWindows);
    let samEvidence: AttemptAnalysis["samEvidence"] = { mode: "unavailable", label: "Attempt video was not submitted for SAM analysis", representativeBoxes: [] };
    if (input.allowMeta && metaIsConfigured()) {
      try {
        if (video) {
          normalized = await normalizeVideo(video);
          metaFileId = await uploadMetaVideo(normalized.outputPath);
          const [grounded, tracked] = await Promise.all([
            coachWithMuse(score.errorWindows, metaFileId),
            trackWithSam(metaFileId),
          ]);
          coaching = grounded;
          samEvidence = tracked;
        } else coaching = await coachWithMuse(score.errorWindows);
      } catch { /* preserve deterministic fallback and unavailable evidence */ }
    }
    const attempt = AttemptAnalysisSchema.parse({
      id: randomUUID(), lessonId: input.lessonId, status: "complete", score, coaching,
      samEvidence,
      createdAt: new Date().toISOString(),
    });
    putAttempt(attempt);
    return Response.json({ attempt });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Attempt analysis failed." }, { status: 400 });
  } finally {
    if (metaFileId) await deleteMetaVideo(metaFileId);
    if (normalized) await normalized.cleanup();
  }
}
