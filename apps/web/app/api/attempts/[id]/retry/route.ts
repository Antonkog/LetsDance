import { ScoreBreakdownSchema } from "@letsdance/contracts";
import { getAttempt } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const baseline = getAttempt(id);
    if (!baseline) return Response.json({ error: "Attempt not found or expired." }, { status: 404 });
    const input = await request.json() as { score?: unknown };
    const retry = ScoreBreakdownSchema.parse(input.score);
    const target = baseline.coaching.drill.focus;
    const before = baseline.score.bodyParts[target] ?? baseline.score.pose;
    const after = retry.bodyParts[target] ?? retry.pose;
    return Response.json({
      target,
      before: Math.round(before),
      after: Math.round(after),
      improvement: Math.round(after - before),
      verified: after - before >= 10,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Retry comparison failed." }, { status: 400 });
  }
}
