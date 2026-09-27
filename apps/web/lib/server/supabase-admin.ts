type Primitive = string | number | boolean;

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, Primitive | null | undefined>;
  body?: unknown;
  prefer?: string;
};

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "";
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getServiceRoleKey());
}

function requireSupabaseConfig() {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
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

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    cache: "no-store",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
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
