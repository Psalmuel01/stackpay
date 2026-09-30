import { jsonOk, apiFailure } from "@/lib/server/http";
import { supabaseRequest } from "@/lib/server/supabase-admin";
import { challengeCookie, getSessionWallet, requireSameOrigin, revokeSession, sessionCookie, setAuthCookie } from "@/lib/server/wallet-auth";
// Session-scoped responses must never be prerendered or shared across users.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const response = jsonOk({ walletAddress: await getSessionWallet(request) });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) { return apiFailure(error); }
}
/** Signs out. With `?scope=all`, revokes every session for the signed-in wallet. */
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    if (new URL(request.url).searchParams.get("scope") === "all") {
      const wallet = await getSessionWallet(request);
      if (wallet) await supabaseRequest("rpc/revoke_wallet_sessions", { method: "POST", body: { p_wallet: wallet } });
    }
    await revokeSession(request);
    const response = jsonOk({ signedOut: true });
    setAuthCookie(response, sessionCookie, "", 0);
    setAuthCookie(response, challengeCookie, "", 0);
    return response;
  } catch (error) { return apiFailure(error); }
}
