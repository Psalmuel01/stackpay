import { readJsonObject } from "@/lib/server/request-body";
import { jsonOk, apiFailure } from "@/lib/server/http";
import { ApiError } from "@/lib/server/api-error";
import { challengeMatchesContext, challengeCookie, clientAddress, cookieValue, hashToken, newToken, requireSameOrigin, revokeSession, sessionAudience, sessionCookie, setAuthCookie, takeRateLimit, verifyWalletSignature } from "@/lib/server/wallet-auth";
import { selectRows, supabaseRequest } from "@/lib/server/supabase-admin";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { signature, publicKey } = await readJsonObject(request);
    await takeRateLimit(`auth-verify:${clientAddress(request)}`, 30, 60);
    const challengeToken = cookieValue(request, challengeCookie);
    if (!/^[0-9a-f]{64}$/.test(challengeToken)) throw new ApiError(401, "invalid_challenge", "Request a new sign-in challenge.");
    const id = hashToken(challengeToken);
    const rows = await selectRows("wallet_auth_challenges", { id: `eq.${id}`, consumed: "eq.false", expires_at: `gt.${new Date().toISOString()}`, limit: 1 });
    const challenge = rows?.[0];
    if (!challenge || !challengeMatchesContext(request, challenge.wallet_address, challengeToken, challenge.message) || !verifyWalletSignature(challenge.message, challenge.wallet_address, publicKey, signature)) {
      throw new ApiError(401, "invalid_signature", "Wallet signature is invalid or expired.");
    }
    const token = newToken();
    const consumed = await supabaseRequest("rpc/consume_wallet_challenge", { method: "POST", body: { p_id: id, p_token_hash: hashToken(token), p_audience: sessionAudience(request) } });
    if (consumed !== true) throw new ApiError(401, "challenge_used", "Request a new sign-in challenge.");
    await revokeSession(request);
    const response = jsonOk({ walletAddress: challenge.wallet_address });
    setAuthCookie(response, sessionCookie, token, 8 * 60 * 60);
    setAuthCookie(response, challengeCookie, "", 0);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) { return apiFailure(error); }
}
