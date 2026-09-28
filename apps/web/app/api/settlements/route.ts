import { requireMerchant } from "@/lib/server/wallet-auth";
import { apiFailure } from "@/lib/server/http";
import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/server/http";
import {
  getSettlementDashboard,
  prepareSettlementWithdrawal,
} from "@/lib/server/stackpay-service";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";

// Session-scoped responses must never be prerendered or shared across users.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }


  try {
    const authenticatedWallet = await requireMerchant(request);
    const result = await getSettlementDashboard(authenticatedWallet);
    return jsonOk(result);
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  try {
    const authenticatedWallet = await requireMerchant(request);
    const payload = await request.json();
    payload.walletAddress = authenticatedWallet;
    const result = await prepareSettlementWithdrawal(payload);
    return jsonOk(result, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}
