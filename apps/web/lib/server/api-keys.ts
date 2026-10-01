import { z } from "zod";
import { ApiError } from "./api-error";
import { insertRow, patchRows, selectRows } from "./supabase-admin";
import { getMerchantProfileByWallet } from "./stackpay-service";
import { API_SCOPES, deploymentEnvironment, generateApiKey } from "./api/v1";
import { audit } from "./audit";

/**
 * API key administration. Only a signed-in merchant (wallet session) can manage keys; an API key
 * can never create, rotate, or widen keys, so a leaked key cannot escalate its own access.
 */

const MAX_ACTIVE_KEYS = 10;
type Row = Record<string, any>;

export const createKeySchema = z
  .object({
    name: z.string().trim().max(80, "name must be at most 80 characters").default(""),
    scopes: z.array(z.enum(API_SCOPES)).min(1, "choose at least one scope").max(API_SCOPES.length),
  })
  .strict();

function serializeKey(row: Row) {
  return {
    id: row.id,
    object: "api_key",
    name: row.name,
    environment: row.environment,
    prefix: row.key_prefix,
    scopes: row.scopes,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    status: row.revoked_at ? "revoked" : row.expires_at && Date.parse(row.expires_at) <= Date.now() ? "expired" : "active",
  };
}

async function merchantFor(wallet: string) {
  const merchant = await getMerchantProfileByWallet(wallet);
  if (!merchant) throw new ApiError(409, "merchant_profile_required", "Complete your merchant profile before creating API keys.");
  return merchant;
}

export async function listApiKeys(wallet: string) {
  const merchant = await merchantFor(wallet);
  const rows = (await selectRows("api_keys", { select: "*", merchant_id: `eq.${merchant.id}`, order: "created_at.desc", limit: 50 })) as Row[];
  return rows.map(serializeKey);
}

async function insertKey(merchantId: string, name: string, scopes: string[]) {
  const environment = deploymentEnvironment();
  const { secret, prefix, hash } = generateApiKey(environment);
  const row = await insertRow("api_keys", { merchant_id: merchantId, name, environment, key_prefix: prefix, key_hash: hash, scopes });
  return { key: serializeKey(row), secret };
}

export async function createApiKey(wallet: string, input: z.infer<typeof createKeySchema>) {
  const merchant = await merchantFor(wallet);
  const active = (await selectRows("api_keys", { select: "id", merchant_id: `eq.${merchant.id}`, revoked_at: "is.null" })) as Row[];
  if (active.length >= MAX_ACTIVE_KEYS) throw new ApiError(409, "too_many_keys", `Revoke an unused key first; at most ${MAX_ACTIVE_KEYS} keys can be active.`);
  const created = await insertKey(String(merchant.id), input.name, input.scopes);
  await audit({ merchantId: String(merchant.id), actorType: "wallet", actorId: wallet, action: "api_key.created", targetType: "api_key", targetId: created.key.id, metadata: { scopes: input.scopes } });
  return created;
}

async function ownedKey(wallet: string, id: string) {
  const merchant = await merchantFor(wallet);
  const rows = (await selectRows("api_keys", { select: "*", id: `eq.${id}`, merchant_id: `eq.${merchant.id}`, limit: 1 })) as Row[];
  if (!rows[0]) throw new ApiError(404, "api_key_not_found", "API key not found.");
  return { merchant, key: rows[0] };
}

export async function revokeApiKey(wallet: string, id: string) {
  const { merchant, key } = await ownedKey(wallet, id);
  if (!key.revoked_at) {
    await patchRows("api_keys", { id }, { revoked_at: new Date().toISOString() });
    await audit({ merchantId: String(merchant.id), actorType: "wallet", actorId: wallet, action: "api_key.revoked", targetType: "api_key", targetId: id });
  }
  const { key: updated } = await ownedKey(wallet, id);
  return serializeKey(updated);
}

/** Issues a replacement with the same name and scopes; the old key keeps working for 24 hours. */
export async function rotateApiKey(wallet: string, id: string) {
  const { merchant, key } = await ownedKey(wallet, id);
  if (key.revoked_at) throw new ApiError(409, "api_key_revoked", "A revoked key cannot be rotated. Create a new key instead.");
  const created = await insertKey(String(merchant.id), String(key.name), key.scopes as string[]);
  const graceEnds = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  if (!key.expires_at || Date.parse(key.expires_at) > Date.parse(graceEnds)) {
    await patchRows("api_keys", { id }, { expires_at: graceEnds });
  }
  await audit({ merchantId: String(merchant.id), actorType: "wallet", actorId: wallet, action: "api_key.rotated", targetType: "api_key", targetId: id, metadata: { replacement: created.key.id, old_key_expires_at: graceEnds } });
  return { ...created, replaced: { id, expires_at: graceEnds } };
}
