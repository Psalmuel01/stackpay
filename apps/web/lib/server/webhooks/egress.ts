import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { isIP, type LookupFunction } from "node:net";

/**
 * Outbound webhook requests are a server-side request forgery surface: a merchant could register
 * an endpoint that points at internal infrastructure. Every delivery resolves the hostname,
 * rejects private, loopback, link-local, and other non-public addresses, and connects to the
 * address that was checked (pinned through `lookup`), so DNS rebinding cannot swap it afterwards.
 * Redirects are never followed.
 */

export class EgressError extends Error {}

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const value = ipv4ToInt(ip);
    return !BLOCKED_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPublicAddress(mapped[1]);
    if (lower === "::" || lower === "::1") return false;
    // Unique local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8), documentation (2001:db8::/32), NAT64 (64:ff9b::/96)
    if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff") || lower.startsWith("2001:db8") || lower.startsWith("64:ff9b")) return false;
    return true;
  }
  return false;
}

function allowLocalhost() {
  return process.env.STACKPAY_ALLOW_LOCALHOST_WEBHOOKS === "true" && process.env.NODE_ENV !== "production";
}

/** Registration-time check. The authoritative check happens again on every delivery. */
export function validateEndpointUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EgressError("url must be a valid URL.");
  }
  const localhost = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.username || url.password) throw new EgressError("url must not contain credentials.");
  if (url.hash) throw new EgressError("url must not contain a fragment.");
  if (localhost && allowLocalhost() && (url.protocol === "http:" || url.protocol === "https:")) return url;
  if (url.protocol !== "https:") throw new EgressError("url must use https.");
  if (url.port && url.port !== "443") throw new EgressError("url must use the default https port (443).");
  if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ""))) throw new EgressError("url must point to a public address.");
  if (localhost || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal") || !url.hostname.includes(".")) {
    throw new EgressError("url must be a public hostname.");
  }
  return url;
}

/** Resolves a hostname and returns every address, all of which must be public. */
async function resolvePublic(hostname: string): Promise<Array<{ address: string; family: number }>> {
  const literal = hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal)) {
    if (!isPublicAddress(literal) && !allowLocalhost()) throw new EgressError("destination is not a public address");
    return [{ address: literal, family: isIP(literal) }];
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length) throw new EgressError("destination did not resolve");
  const localhostAllowed = allowLocalhost() && hostname === "localhost";
  // Every resolved address must be public; otherwise a multi-record response could smuggle one in.
  if (!localhostAllowed && addresses.some((entry) => !isPublicAddress(entry.address))) throw new EgressError("destination resolves to a non-public address");
  return addresses;
}

export type EgressResponse = { status: number; headers: Record<string, string | string[] | undefined>; excerpt: string; durationMs: number };

export async function postJson(target: string, body: string, headers: Record<string, string>, timeoutMs = 10_000): Promise<EgressResponse> {
  const url = validateEndpointUrl(target);
  const resolved = await resolvePublic(url.hostname);
  // Only the addresses checked above can be used for the connection (no DNS rebinding). All of them
  // are offered so the connection can fall back between IPv6 and IPv4.
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    if (typeof options === "object" && options && "all" in options && options.all) {
      (callback as unknown as (err: null, addresses: Array<{ address: string; family: number }>) => void)(null, resolved);
    } else {
      const preferred = resolved.find((entry) => entry.family === 4) ?? resolved[0];
      callback(null, preferred.address, preferred.family);
    }
  };
  const started = Date.now();
  const send = url.protocol === "http:" ? httpRequest : httpsRequest;
  return new Promise((resolve, reject) => {
    const req = send(url, {
      method: "POST",
      // Node 20+ tries all addresses from `lookup` (autoSelectFamily is on by default).
      lookup: pinnedLookup,
      headers: { ...headers, "Content-Length": Buffer.byteLength(body).toString() },
      timeout: timeoutMs,
    }, (res) => {
      let excerpt = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        if (excerpt.length < 500) excerpt += chunk.slice(0, 500 - excerpt.length);
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, excerpt, durationMs: Date.now() - started }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new EgressError(`timed out after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end(body);
  });
}
