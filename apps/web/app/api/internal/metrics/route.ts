import { jsonError } from "@/lib/server/http";
import { isJobRequestAuthorized } from "@/lib/server/jobs";
import { evaluateAlerts, getMetrics, readiness, toPrometheus } from "@/lib/server/operations";

export const dynamic = "force-dynamic";

/** Protected operational metrics: JSON by default, Prometheus text with ?format=prometheus. */
export async function GET(request: Request) {
  if (!isJobRequestAuthorized(request)) return jsonError(401, "unauthorized", "A valid job secret is required.");
  const format = new URL(request.url).searchParams.get("format");
  if (format === "prometheus") {
    const metrics = await getMetrics();
    return new Response(toPrometheus(metrics, evaluateAlerts(metrics)), { headers: { "Content-Type": "text/plain; version=0.0.4", "Cache-Control": "no-store" } });
  }
  const ready = await readiness();
  const metrics = ready.checks.database.ok ? await getMetrics() : null;
  return Response.json({ readiness: ready, metrics }, { headers: { "Cache-Control": "no-store" } });
}
