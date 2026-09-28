import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateStacksAddress } from '@stacks/transactions';

const apiUrls = {
  testnet: 'https://api.testnet.hiro.so',
  mainnet: 'https://api.hiro.so',
};

export function deploymentConfig(env) {
  const network = env.NEXT_PUBLIC_STACKS_NETWORK;
  if (!Object.hasOwn(apiUrls, network)) throw new Error('Explicit mainnet or testnet network required');
  const contracts = ['ARCHITECTURE', 'PROCESSOR'].map(kind => {
    const id = env[`NEXT_PUBLIC_STACKPAY_${kind}_CONTRACT_ID`];
    const parts = typeof id === 'string' ? id.split('.') : [];
    const [address, name] = parts;
    const prefix = network === 'mainnet' ? /^S[PM]/ : /^S[TN]/;
    if (parts.length !== 2 || !prefix.test(address) || !validateStacksAddress(address) ||
        !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(name)) {
      throw new Error(`Invalid ${kind.toLowerCase()} contract for ${network}`);
    }
    return { kind: kind.toLowerCase(), id, address, name };
  });
  if (contracts[0].id === contracts[1].id) throw new Error('Architecture and processor must be different contracts');
  return { network, apiUrl: apiUrls[network], contracts };
}

// Public read-only evidence collection. Availability is not a security review,
// canonical transaction verification, or proof that this pair is wired correctly.
export async function inspectDeployment(env, fetcher = fetch) {
  const config = deploymentConfig(env);
  async function read(path) {
    try {
      const response = await fetcher(`${config.apiUrl}${path}`, {
        signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
      if (!response.ok) return { status: response.status, error: 'http_error' };
      return { status: response.status, data: await response.json() };
    } catch {
      // Do not expose arbitrary upstream messages, proxy details, or environment.
      return { error: 'unreachable_or_invalid_response' };
    }
  }
  const contracts = await Promise.all(config.contracts.map(async contract => {
    const [source, indexer] = await Promise.all([
      read(`/v2/contracts/source/${contract.address}/${contract.name}?proof=0`),
      read(`/extended/v1/contract/${contract.id}`),
    ]);
    const sourceText = source.data?.source;
    const sourceFound = typeof sourceText === 'string' && sourceText.trim().length > 0;
    const txId = indexer.data?.tx_id;
    const indexerFound = indexer.data?.contract_id === contract.id &&
      typeof txId === 'string' && /^0x[0-9a-f]{64}$/i.test(txId);
    return {
      kind: contract.kind, contract_id: contract.id,
      source_status: source.status ?? null,
      indexer_status: indexer.status ?? null,
      source_sha256: sourceFound ? createHash('sha256').update(sourceText).digest('hex') : null,
      deployment_tx_id: indexerFound ? txId.toLowerCase() : null,
      available: sourceFound && indexerFound,
      errors: [!sourceFound && (source.error ?? 'missing_source'),
        !indexerFound && (indexer.error ?? 'missing_or_mismatched_indexer_contract')].filter(Boolean),
    };
  }));
  return {
    checked_at: new Date().toISOString(), network: config.network,
    api_url: config.apiUrl, available: contracts.every(contract => contract.available), contracts,
    review_required: 'Verify canonical deployment transactions, source wiring, admin state and token assets before registry insertion or payment acceptance.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await inspectDeployment(process.env);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.available ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
