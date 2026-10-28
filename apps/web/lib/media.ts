import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { MAX_SOURCE_VIDEO_BYTES, MAX_SOURCE_VIDEO_MB, MAX_VIDEO_DURATION_SECONDS } from "@/lib/video-constraints";

const run = promisify(execFile);

export type NormalizedVideo = {
  directory: string;
  inputPath: string;
  outputPath: string;
  durationMs: number;
  cleanup: () => Promise<void>;
};

export async function normalizeVideo(file: File): Promise<NormalizedVideo> {
  if (file.size > MAX_SOURCE_VIDEO_BYTES) throw new Error(`Video exceeds the ${MAX_SOURCE_VIDEO_MB} MB source upload limit.`);
  const extension = extname(file.name).toLowerCase() || ".mp4";
  if (![".mp4", ".mov", ".m4v", ".webm"].includes(extension)) throw new Error("Use an MP4, MOV or WebM video.");
  const directory = await mkdtemp(join(tmpdir(), "lets-dance-"));
  const inputPath = join(directory, `source${extension}`);
  const outputPath = join(directory, "normalized.mp4");
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
    const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", inputPath]);
    const durationSeconds = Number(probe.stdout.trim());
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Could not read the video duration.");
    if (durationSeconds > MAX_VIDEO_DURATION_SECONDS) throw new Error("Video must be no longer than 60 seconds.");
    await run("ffmpeg", [
      "-y", "-i", inputPath,
      "-vf", "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=15",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", "-an", outputPath,
    ], { maxBuffer: 8 * 1024 * 1024 });
    return { directory, inputPath, outputPath, durationMs: Math.round(durationSeconds * 1000), cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
