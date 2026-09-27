import { ApiError } from "@/lib/server/api-error";
import { jsonOk, apiFailure } from "@/lib/server/http";
import { appOrigin, challengeCookie, hashToken, newToken, requireSameOrigin, setAuthCookie, validateWallet } from "@/lib/server/wallet-auth";
import { supabaseRequest } from "@/lib/server/supabase-admin";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { walletAddress } = await request.json();
    validateWallet(walletAddress);
    const token = newToken();
    const message = ["Sign in to StackPay", `Origin: ${appOrigin(request)}`, `Wallet: ${walletAddress}`,
      `Network: ${process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet"}`, `Nonce: ${token}`,
      `Issued at: ${new Date().toISOString()}`, "Expires in 5 minutes. This signature does not authorize a transaction."].join("\n");
    const issued = await supabaseRequest("rpc/issue_wallet_challenge", { method: "POST", body: { p_id: hashToken(token), p_wallet: walletAddress, p_message: message } });
    if (issued !== true) throw new ApiError(429, "too_many_challenges", "Too many sign-in attempts. Wait a minute and try again.");
    const response = jsonOk({ message });
    setAuthCookie(response, challengeCookie, token, 300);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) { return apiFailure(error); }
}
