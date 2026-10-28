import { getAttempt } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const attempt = getAttempt(id);
  return attempt ? Response.json({ attempt }) : Response.json({ error: "Attempt not found or expired." }, { status: 404 });
}
