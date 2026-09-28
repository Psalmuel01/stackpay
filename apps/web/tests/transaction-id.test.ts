import { afterEach, expect, it, vi } from "vitest";
import { normalizeTransactionId } from "../lib/transaction-id";
import { syncTransaction } from "../lib/server/stacks-api";
import type { ExpectedTransaction } from "../lib/server/transaction-verification";
const expected: ExpectedTransaction = { contractId: "ST000000000000000000002AMW42H.proc", functionName: "process-stx-payment", network: "testnet", arguments: [] };
afterEach(() => vi.unstubAllGlobals());
it.each(["a".repeat(64), "0x" + "a".repeat(64), "0X" + "A".repeat(64)])("normalizes wallet hash %s before chain lookup", async hash => {
  const fetcher = vi.fn().mockResolvedValue({ status: 404 });
  vi.stubGlobal("fetch", fetcher);
  expect(normalizeTransactionId(hash)).toBe("0x" + "a".repeat(64));
  await expect(syncTransaction(hash, expected)).resolves.toEqual({ status: "pending" });
  expect(fetcher.mock.calls[0][0]).toContain("/extended/v1/tx/0x" + "a".repeat(64));
});
it.each([undefined, null, {}, "", "a".repeat(63), "a".repeat(65), "z".repeat(64), "0x0x" + "a".repeat(64), " " + "a".repeat(64), "../tx"])('rejects malformed hash %s without contacting chain', async hash => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(normalizeTransactionId(hash)).toBeNull();
  await expect(syncTransaction(hash as string, expected)).rejects.toMatchObject({ code: "invalid_tx_id" });
  expect(fetcher).not.toHaveBeenCalled();
});
