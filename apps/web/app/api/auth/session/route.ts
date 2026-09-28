import { jsonOk, apiFailure } from "@/lib/server/http";
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
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await revokeSession(request);
    const response = jsonOk({ signedOut: true });
    setAuthCookie(response, sessionCookie, "", 0);
    setAuthCookie(response, challengeCookie, "", 0);
    return response;
  } catch (error) { return apiFailure(error); }
}
