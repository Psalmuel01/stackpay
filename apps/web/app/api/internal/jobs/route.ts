import { jsonError, jsonOk } from "@/lib/server/http";
import { isJobRequestAuthorized, runJobs } from "@/lib/server/jobs";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!isSupabaseConfigured()) return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  if (!isJobRequestAuthorized(request)) return jsonError(401, "unauthorized", "A valid job secret is required.");
  return jsonOk(await runJobs());
}

// Vercel Cron issues GET requests; other schedulers can POST.
export const GET = handle;
export const POST = handle;
