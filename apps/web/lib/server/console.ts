import { apiFailure, jsonOk } from "./http";
import { requireMerchant } from "./wallet-auth";
import { getMerchantProfileByWallet } from "./stackpay-service";
import { ApiError } from "./api-error";

/** Console (wallet-session) route helper: resolves the signed-in merchant and maps errors. */
export function consoleRoute(
  handler: (merchant: { id: string; wallet: string }, request: Request, params: Record<string, string>) => Promise<{ status?: number; body: unknown }>
) {
  /** Matches Next.js 15 route handlers: (request, { params: Promise<…> }). */
  return async (request: Request, route: { params: Promise<Record<string, string>> }) => {
    try {
      const wallet = await requireMerchant(request);
      const profile = await getMerchantProfileByWallet(wallet);
      if (!profile) throw new ApiError(409, "merchant_profile_required", "Complete your merchant profile first.");
      const result = await handler({ id: String(profile.id), wallet }, request, (await route?.params) ?? {});
      const response = jsonOk(result.body, { status: result.status ?? 200 });
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      return apiFailure(error);
    }
  };
}
