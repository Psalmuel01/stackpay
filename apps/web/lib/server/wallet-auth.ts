import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { publicKeyToAddress, validateStacksAddress } from "@stacks/transactions";
import { verifyMessageSignatureRsv } from "@stacks/encryption";
import { readOptionalJsonObject } from "./request-body";
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
/** Sessions are only valid for the app origin and network that issued them. */
export function sessionAudience(request: Request) {
  return `${appOrigin(request)}|${process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "mainnet" : "testnet"}`;
}

/** Best-effort client address for abuse throttling (set by the hosting proxy). */
export function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Shared fixed-window limiter backed by the database, so it holds across server instances. */
export async function takeRateLimit(key: string, limit: number, windowSeconds: number) {
  const allowed = await supabaseRequest("rpc/take_rate_limit", { method: "POST", body: { p_key: key, p_limit: limit, p_window_seconds: windowSeconds } });
  if (allowed !== true) throw new ApiError(429, "rate_limited", "Too many requests. Wait a minute and try again.");
}

export async function getSessionWallet(request: Request) {
  const token = cookieValue(request, sessionCookie);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const rows = await selectRows("wallet_sessions", { token_hash: `eq.${hashToken(token)}`, expires_at: `gt.${new Date().toISOString()}`, audience: `eq.${sessionAudience(request)}`, select: "wallet_address", limit: 1 });
  const wallet = rows?.[0]?.wallet_address;
  if (!wallet) return null;
  try { validateWallet(wallet); } catch { return null; }
  return wallet;
}
export async function requireMerchant(request: Request) {
  if (request.method !== "GET") requireSameOrigin(request);
  const wallet = await getSessionWallet(request);
  if (!wallet) throw new ApiError(401, "authentication_required", "Sign in with your wallet to continue.");
  validateWallet(wallet);
  let supplied: unknown;
  if (request.method === "GET") supplied = new URL(request.url).searchParams.get("walletAddress");
  else {
    // Bodiless actions (send test, rotate, delete, replay) carry no wallet assertion.
    const payload = await readOptionalJsonObject(request.clone());
    supplied = payload.walletAddress;
  }
  if (supplied != null && supplied !== wallet) throw new ApiError(403, "wallet_mismatch", "This wallet does not own the session.");
  return wallet;
}
export async function revokeSession(request: Request) {
  const token = cookieValue(request, sessionCookie);
  if (/^[0-9a-f]{64}$/.test(token)) await supabaseRequest("wallet_sessions", { method: "DELETE", query: { token_hash: `eq.${hashToken(token)}` } });
}


export function walletChallengeMessage(request: Request, wallet: string, nonce: string, issuedAt = new Date().toISOString()) {
  return ["Sign in to StackPay", `Origin: ${appOrigin(request)}`, `Wallet: ${wallet}`,
    `Network: ${process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "mainnet" : "testnet"}`, `Nonce: ${nonce}`,
    `Issued at: ${issuedAt}`, "Expires in 5 minutes. This signature does not authorize a transaction."].join("\n");
}

/** The stored signature must authorize this audience/network and this nonce. */
export function challengeMatchesContext(request: Request, wallet: string, nonce: string, message: unknown) {
  if (typeof message !== "string") return false;
  const issuedAt = message.split("\n")[5]?.replace(/^Issued at: /, "");
  if (!issuedAt || !Number.isFinite(Date.parse(issuedAt))) return false;
  return message === walletChallengeMessage(request, wallet, nonce, issuedAt);
}
