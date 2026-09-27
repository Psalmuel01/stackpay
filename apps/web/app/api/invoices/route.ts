import { requireMerchant } from "@/lib/server/wallet-auth";
import { apiFailure } from "@/lib/server/http";
import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/server/http";
import {
  listInvoicesForWallet,
  prepareInvoiceCreation,
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
    const authenticatedWallet = await requireMerchant(request);
    const invoices = await listInvoicesForWallet(authenticatedWallet);
    return jsonOk(invoices);
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
    const result = await prepareInvoiceCreation(payload);
    return jsonOk(result, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}
