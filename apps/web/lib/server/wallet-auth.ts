import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { publicKeyToAddress, validateStacksAddress } from "@stacks/transactions";
import { verifyMessageSignatureRsv } from "@stacks/encryption";
import { ApiError } from "./api-error";
import { selectRows, supabaseRequest } from "./supabase-admin";

const production = process.env.NODE_ENV === "production";
export const sessionCookie = production ? "__Host-stackpay-session" : "stackpay-session";
export const challengeCookie = production ? "__Host-stackpay-challenge" : "stackpay-challenge";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export function cookieValue(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}
export function setAuthCookie(response: NextResponse, name: string, value: string, maxAge: number) {
  response.cookies.set(name, value, { httpOnly: true, secure: production, sameSite: "strict", path: "/", maxAge });
}
export function appOrigin(request: Request) {
  const configured = process.env.STACKPAY_APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!configured && production) throw new ApiError(503, "auth_not_configured", "Server sign-in origin is not configured.");
  const url = new URL(configured ?? request.url);
  if (production && url.protocol !== "https:") throw new ApiError(503, "auth_not_configured", "Production sign-in requires HTTPS.");
  return url.origin;
}
export function requireSameOrigin(request: Request) {
  if (request.headers.get("origin") !== appOrigin(request)) {
    throw new ApiError(403, "invalid_origin", "Request origin is not allowed.");
  }
}
export function validateWallet(wallet: unknown): asserts wallet is string {
  const prefix = process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "SP" : "ST";
  if (typeof wallet !== "string" || !wallet.startsWith(prefix) || !validateStacksAddress(wallet)) {
    throw new ApiError(400, "invalid_wallet", "A single-signature wallet on the configured network is required.");
  }
}
export function verifyWalletSignature(message: string, wallet: string, publicKey: unknown, signature: unknown) {
  try {
    if (typeof publicKey !== "string" || !/^(02|03)[0-9a-f]{64}$/i.test(publicKey) ||
        typeof signature !== "string" || !/^[0-9a-f]{130}$/i.test(signature)) return false;
    const network = process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "mainnet" : "testnet";
    return publicKeyToAddress(publicKey, network) === wallet && verifyMessageSignatureRsv({ message, publicKey, signature });
  } catch { return false; }
}
export async function getSessionWallet(request: Request) {
  const token = cookieValue(request, sessionCookie);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const rows = await selectRows("wallet_sessions", { token_hash: `eq.${hashToken(token)}`, expires_at: `gt.${new Date().toISOString()}`, select: "wallet_address", limit: 1 });
  return rows?.[0]?.wallet_address as string | undefined ?? null;
}
export async function requireMerchant(request: Request) {
  if (request.method !== "GET") requireSameOrigin(request);
  const wallet = await getSessionWallet(request);
  if (!wallet) throw new ApiError(401, "authentication_required", "Sign in with your wallet to continue.");
  validateWallet(wallet);
  let supplied: unknown;
  if (request.method === "GET") supplied = new URL(request.url).searchParams.get("walletAddress");
  else {
    const payload = await request.clone().json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ApiError(400, "invalid_request", "A JSON object is required.");
    supplied = payload.walletAddress;
  }
  if (supplied != null && supplied !== wallet) throw new ApiError(403, "wallet_mismatch", "This wallet does not own the session.");
  return wallet;
}
export async function revokeSession(request: Request) {
  const token = cookieValue(request, sessionCookie);
  if (/^[0-9a-f]{64}$/.test(token)) await supabaseRequest("wallet_sessions", { method: "DELETE", query: { token_hash: `eq.${hashToken(token)}` } });
}
