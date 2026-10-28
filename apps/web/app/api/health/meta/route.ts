import { metaIsConfigured } from "@/lib/meta";

export const runtime = "nodejs";

export async function GET() {
  if (!metaIsConfigured()) return Response.json({ configured: false, reachable: false, mode: "demo", message: "MODEL_API_KEY is not configured." });
  try {
    const response = await fetch(`${process.env.META_MODEL_API_BASE_URL || "https://api.meta.ai/v1"}/models`, {
      headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    return Response.json({ configured: true, reachable: response.ok, mode: response.ok ? "meta" : "demo", status: response.status });
  } catch (error) {
    return Response.json({ configured: true, reachable: false, mode: "demo", message: error instanceof Error ? error.message : "Connectivity check failed." });
  }
}
