import { callRpc } from "./supabase-admin";

/**
 * Registered contract deployments for this network. Records are bound to the deployment they were
 * created on, so an invoice created before a contract upgrade is still paid and verified against
 * its own processor. The directory changes only through reviewed migrations/activations, so a short
 * cache is safe.
 */

export type Deployment = { id: string; architecture_contract_id: string; processor_contract_id: string; active: boolean };

const TTL_MS = 60_000;
let cache: { network: string; at: number; rows: Deployment[] } | null = null;

function network() {
  return process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet" ? "mainnet" : "testnet";
}

export async function deploymentDirectory(): Promise<Deployment[]> {
  const current = network();
  if (cache && cache.network === current && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await callRpc<Deployment[]>("contract_deployment_directory", { p_network: current });
  cache = { network: current, at: Date.now(), rows: Array.isArray(rows) ? rows : [] };
  return cache.rows;
}

export function resetDeploymentCache() {
  cache = null;
}

/** The processor an invoice must be paid through: its own deployment's, else the configured one. */
export async function processorForDeployment(deploymentId: string | null | undefined) {
  const configured = process.env.NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID ?? "";
  if (!deploymentId) return configured;
  const match = (await deploymentDirectory()).find((row) => row.id === deploymentId);
  return match?.processor_contract_id ?? configured;
}

/** Every contract whose events this network's Chainhook deliveries may carry (current and historical). */
export async function watchedContracts() {
  const configured = [process.env.NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID ?? "", process.env.NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID ?? ""];
  const registered = await deploymentDirectory().then(
    (rows) => rows.flatMap((row) => [row.architecture_contract_id, row.processor_contract_id]),
    () => [] as string[]
  );
  return [...new Set([...configured, ...registered].filter(Boolean))];
}

/** Whether the configured contracts are the database's active, registered deployment. */
export async function deploymentStatus() {
  const architecture = process.env.NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID ?? "";
  const processor = process.env.NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID ?? "";
  const rows = await deploymentDirectory();
  const configured = rows.find((row) => row.architecture_contract_id === architecture && row.processor_contract_id === processor);
  if (!configured) return { ok: false, reason: "unregistered" as const };
  if (!configured.active) return { ok: false, reason: "inactive" as const, deployment_id: configured.id };
  return { ok: true, deployment_id: configured.id };
}
