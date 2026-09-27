import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { supabaseRequest } from "../lib/server/supabase-admin";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://runtime.example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("uses runtime URL and falls back from empty service-role to secret key", async () => {
  fetchMock.mockResolvedValue(new Response("[]", { headers: { "content-type": "application/json" } }));
  await supabaseRequest("wallet_sessions");
  const [url, options] = fetchMock.mock.lastCall!;
  expect(url.origin).toBe("https://runtime.example.com");
  expect(options.headers.apikey).toBe("test-secret");
});
it.each([[404, "PGRST202", "database_migration_required"], [401, "PGRST301", "database_credentials_invalid"], [500, "XX000", "database_request_failed"]])("classifies database failure %s %s", async (status, code, expected) => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ code, message: "private database detail" }), { status }));
  await expect(supabaseRequest("rpc/issue_wallet_challenge")).rejects.toMatchObject({ code: expected });
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private database detail");
});
it("explains an offline local database", async () => {
  vi.stubEnv("SUPABASE_URL", "");
  fetchMock.mockRejectedValue(new TypeError("fetch failed"));
  await expect(supabaseRequest("wallet_sessions")).rejects.toMatchObject({ code: "database_unreachable", message: expect.stringContaining("local database that is offline") });
});
