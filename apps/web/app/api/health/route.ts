import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness: the process is up and serving. Deliberately touches no dependencies. */
export async function GET() {
  return NextResponse.json({ status: "ok", time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
