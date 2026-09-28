import { requireMerchant } from "@/lib/server/wallet-auth";
import { apiFailure } from "@/lib/server/http";
import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/server/http";
import {
  listNotificationsForWallet,
  markNotificationsReadForWallet,
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
    const notifications = await listNotificationsForWallet(authenticatedWallet);
    return jsonOk(notifications);
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "supabase_not_configured", "Supabase environment variables are missing.");
  }

  try {
    const authenticatedWallet = await requireMerchant(request);
    const payload = await request.json();
    payload.walletAddress = authenticatedWallet;
    if (!payload.walletAddress) {
      return jsonError(400, "invalid_request", "walletAddress is required.");
    }

    const notifications = await markNotificationsReadForWallet(String(payload.walletAddress));
    return jsonOk(notifications);
  } catch (error) {
    return apiFailure(error);
  }
}

