import { NextResponse } from "next/server";
import { readiness } from "@/lib/server/operations";

export const dynamic = "force-dynamic";

/** Readiness: database and Stacks API reachable, and the configured contracts are the active deployment. 503 when either is down, for load balancers and uptime checks. */
export async function GET() {
  const result = await readiness();
  // Public callers get only the verdict; details are available on the protected metrics endpoint.
  return NextResponse.json(
    { status: result.status, checks: { database: result.checks.database.ok, stacks_api: result.checks.stacks_api.ok, deployment: result.checks.deployment.ok } },
    { status: result.status === "ready" ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
