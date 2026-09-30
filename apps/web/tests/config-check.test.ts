import { describe, expect, it } from "vitest";
import { checkConfiguration } from "../lib/server/config-check";

const valid = {
  NEXT_PUBLIC_STACKS_NETWORK: "mainnet",
  SUPABASE_URL: "https://db.example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  STACKPAY_APP_ORIGIN: "https://pay.example.com",
  NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID: "SP000000000000000000002Q6VF78.architecture",
  NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID: "SP000000000000000000002Q6VF78.processor",
  NEXT_PUBLIC_STACKPAY_SBTC_CONTRACT_ID: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
  NEXT_PUBLIC_STACKPAY_USDCX_CONTRACT_ID: "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx",
  STACKPAY_CHAINHOOK_SECRET: "c".repeat(40),
  STACKPAY_JOB_SECRET: "j".repeat(40),
  STACKPAY_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};

describe("production configuration", () => {
  it("accepts a complete configuration", () => {
    expect(checkConfiguration(valid)).toEqual([]);
  });

  it("rejects testnet contracts on a mainnet deployment", () => {
    const problems = checkConfiguration({ ...valid, NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID: "ST000000000000000000002AMW42H.processor" });
    expect(problems).toEqual([{ key: "NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID", problem: "belongs to a different network than mainnet" }]);
  });

  it("rejects weak or missing secrets, http origins, and dev-only switches", () => {
    const keys = checkConfiguration({ ...valid, STACKPAY_CHAINHOOK_SECRET: "short", STACKPAY_JOB_SECRET: undefined, STACKPAY_WEBHOOK_ENCRYPTION_KEY: "abc", STACKPAY_APP_ORIGIN: "http://pay.example.com", STACKPAY_ALLOW_LOCALHOST_WEBHOOKS: "true", SUPABASE_SERVICE_ROLE_KEY: "" }).map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(["STACKPAY_CHAINHOOK_SECRET", "STACKPAY_JOB_SECRET", "STACKPAY_WEBHOOK_ENCRYPTION_KEY", "STACKPAY_APP_ORIGIN", "STACKPAY_ALLOW_LOCALHOST_WEBHOOKS", "SUPABASE_SERVICE_ROLE_KEY"]));
  });
});
