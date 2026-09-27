import { ApiError } from "./api-error";

type Primitive = string | number | boolean;

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, Primitive | null | undefined>;
  body?: unknown;
  prefer?: string;
};

function getSupabaseUrl() {
  return process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
}

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim() || "";
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getServiceRoleKey());
}

function requireSupabaseConfig() {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new ApiError(503, "database_not_configured", "The server database URL or secret key is missing. Contact the site administrator.");
  }

  return { supabaseUrl, serviceRoleKey };
}

export async function supabaseRequest(path: string, options: RequestOptions = {}) {
  const { supabaseUrl, serviceRoleKey } = requireSupabaseConfig();
  const url = new URL(`/rest/v1/${path}`, supabaseUrl);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(options.prefer ? { Prefer: options.prefer } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    const localDatabase = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    console.error("[stackpay:database]", { resource: path, code: "database_unreachable" });
    throw new ApiError(503, "database_unreachable", localDatabase
      ? "The app is configured to use a local database that is offline. Start Supabase or configure the hosted database URL and key."
      : "The server cannot reach the database. Please try again shortly.");
  }

  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const code = typeof failure?.code === "string" ? failure.code : undefined;
    // Never log database response text, credentials, request bodies, or row data.
    console.error("[stackpay:database]", { resource: path, status: response.status, code });
    if (["PGRST202", "PGRST205", "42P01", "42883"].includes(code ?? "")) {
      throw new ApiError(503, "database_migration_required", "The database used by this app is missing a required table or function. Apply the wallet-session migration to that database and refresh its API schema cache.");
    }
    if (response.status === 401 || response.status === 403 || code === "42501") {
      throw new ApiError(503, "database_credentials_invalid", "The server database credentials cannot access wallet sign-in. Configure a secret or service-role key from the same Supabase project as the database URL.");
    }
    throw new ApiError(502, "database_request_failed", "The database could not complete the request. Please try again shortly.");
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

export async function insertRow(table: string, row: Record<string, unknown>) {
  const result = await supabaseRequest(table, {
    method: "POST",
    body: row,
    prefer: "return=representation",
  });

  return Array.isArray(result) ? result[0] ?? null : result;
}

export async function upsertRow(
  table: string,
  row: Record<string, unknown>,
  onConflict: string
) {
  const result = await supabaseRequest(table, {
    method: "POST",
    query: { on_conflict: onConflict },
    body: row,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return Array.isArray(result) ? result[0] ?? null : result;
}

export async function selectRows(
  table: string,
  query: Record<string, Primitive | null | undefined> = {}
) {
  return supabaseRequest(table, {
    method: "GET",
    query,
  });
}

export async function patchRows(
  table: string,
  filters: Record<string, Primitive>,
  patch: Record<string, unknown>
) {
  const query: Record<string, Primitive> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && /^[a-z]+\./.test(value)) {
      query[key] = value;
      continue;
    }
    query[key] = `eq.${value}`;
  }

  return supabaseRequest(table, {
    method: "PATCH",
    query,
    body: patch,
    prefer: "return=representation",
  });
}
