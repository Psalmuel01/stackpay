/**
 * Startup configuration validation. In production the server refuses to start with a missing or
 * inconsistent configuration (fail closed) rather than failing on the first payment.
 */

import { validateStacksAddress } from "@stacks/transactions";

export type ConfigProblem = { key: string; problem: string };

function isContractId(value: string) {
  const [address, name, extra] = value.split(".");
  if (extra !== undefined || !name || !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(name)) return false;
  try {
    return validateStacksAddress(address);
  } catch {
    return false;
  }
}

export function checkConfiguration(env: Record<string, string | undefined> = process.env): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const need = (key: string, problem = "is required") => {
    if (!env[key]?.trim()) problems.push({ key, problem });
  };
  const network = env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet";
  if (!["mainnet", "testnet"].includes(network)) problems.push({ key: "NEXT_PUBLIC_STACKS_NETWORK", problem: "must be mainnet or testnet" });

  // Mirrors supabase-admin: the server-only URL wins, the public one is the fallback.
  if (!env.SUPABASE_URL?.trim() && !env.NEXT_PUBLIC_SUPABASE_URL?.trim()) problems.push({ key: "SUPABASE_URL", problem: "is required (or NEXT_PUBLIC_SUPABASE_URL)" });
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim() && !env.SUPABASE_SECRET_KEY?.trim()) problems.push({ key: "SUPABASE_SERVICE_ROLE_KEY", problem: "is required (or SUPABASE_SECRET_KEY)" });

  const origin = env.STACKPAY_APP_ORIGIN ?? env.NEXT_PUBLIC_APP_URL;
  if (!origin) problems.push({ key: "STACKPAY_APP_ORIGIN", problem: "is required (sign-in is bound to it)" });
  else {
    try {
      if (new URL(origin).protocol !== "https:") problems.push({ key: "STACKPAY_APP_ORIGIN", problem: "must use https in production" });
    } catch {
      problems.push({ key: "STACKPAY_APP_ORIGIN", problem: "must be a valid URL" });
    }
  }

  const prefix = network === "mainnet" ? /^S[PM]/ : /^S[TN]/;
  for (const key of ["NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID", "NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID", "NEXT_PUBLIC_STACKPAY_SBTC_CONTRACT_ID", "NEXT_PUBLIC_STACKPAY_USDCX_CONTRACT_ID"]) {
    const value = env[key]?.trim();
    if (!value) problems.push({ key, problem: "is required" });
    else if (!isContractId(value)) problems.push({ key, problem: "is not a valid contract id" });
    else if (!prefix.test(value)) problems.push({ key, problem: `belongs to a different network than ${network}` });
  }

  if ((env.STACKPAY_CHAINHOOK_SECRET ?? "").length < 32) problems.push({ key: "STACKPAY_CHAINHOOK_SECRET", problem: "must be at least 32 characters" });
  if (!env.STACKPAY_JOB_SECRET && !env.CRON_SECRET) problems.push({ key: "STACKPAY_JOB_SECRET", problem: "is required (or CRON_SECRET) so background jobs can run" });
  for (const key of ["STACKPAY_JOB_SECRET", "CRON_SECRET"]) {
    if (env[key] && env[key]!.length < 32) problems.push({ key, problem: "must be at least 32 characters" });
  }
  if (Buffer.from(env.STACKPAY_WEBHOOK_ENCRYPTION_KEY ?? "", "base64").length !== 32) {
    problems.push({ key: "STACKPAY_WEBHOOK_ENCRYPTION_KEY", problem: "must be 32 random bytes, base64-encoded" });
  }
  if (env.STACKPAY_ALLOW_LOCALHOST_WEBHOOKS === "true") problems.push({ key: "STACKPAY_ALLOW_LOCALHOST_WEBHOOKS", problem: "must not be enabled in production" });
  return problems;
}

export function assertProductionConfiguration() {
  // Only a running production server is checked; builds (NEXT_PHASE) have no runtime secrets.
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build" || process.env.STACKPAY_SKIP_CONFIG_CHECK === "true") return;
  const problems = checkConfiguration();
  if (problems.length) {
    const detail = problems.map((p) => `  - ${p.key} ${p.problem}`).join("\n");
    throw new Error(`StackPay refused to start: invalid production configuration.\n${detail}`);
  }
}
