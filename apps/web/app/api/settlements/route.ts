import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/server/http";
import {
  getSettlementDashboard,
  prepareSettlementWithdrawal,
} from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  const walletAddress = request.nextUrl.searchParams.get("walletAddress");
  if (!walletAddress) {
    return jsonError(400, "invalid_request", "walletAddress is required.");
  }

  try {
    const result = await getSettlementDashboard(walletAddress);
    return jsonOk(result);
  } catch (error) {
    return jsonError(500, "settlements_failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  try {
    const payload = await request.json();
    const result = await prepareSettlementWithdrawal(payload);
    return jsonOk(result, { status: 201 });
  } catch (error) {
    return jsonError(500, "settlement_prepare_failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}
