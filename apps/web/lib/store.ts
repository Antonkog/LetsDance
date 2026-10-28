import type { AttemptAnalysis, LessonManifest } from "@letsdance/contracts";

type Stored<T> = { value: T; expiresAt: number };
type GlobalStores = typeof globalThis & {
  __letsDanceLessons?: Map<string, Stored<LessonManifest>>;
  __letsDanceAttempts?: Map<string, Stored<AttemptAnalysis>>;
};

const globalStores = globalThis as GlobalStores;
const lessons = globalStores.__letsDanceLessons ?? new Map<string, Stored<LessonManifest>>();
const attempts = globalStores.__letsDanceAttempts ?? new Map<string, Stored<AttemptAnalysis>>();
globalStores.__letsDanceLessons = lessons;
globalStores.__letsDanceAttempts = attempts;

const TTL_MS = 2 * 60 * 60 * 1000;

function read<T>(store: Map<string, Stored<T>>, id: string) {
  const entry = store.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(id);
    return undefined;
  }
  return entry.value;
}

export function putLesson(lesson: LessonManifest) {
  lessons.set(lesson.id, { value: lesson, expiresAt: Date.now() + TTL_MS });
}

export function getLesson(id: string) {
  return read(lessons, id);
}

export function putAttempt(attempt: AttemptAnalysis) {
  attempts.set(attempt.id, { value: attempt, expiresAt: Date.now() + TTL_MS });
}

export function getAttempt(id: string) {
  return read(attempts, id);
}
