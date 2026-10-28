import { getLesson } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const lesson = getLesson(id);
  return lesson ? Response.json({ lesson }) : Response.json({ error: "Lesson not found or expired." }, { status: 404 });
}
