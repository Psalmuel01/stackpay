import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentConfig, inspectDeployment } from './check-contract-deployment.mjs';
const address = 'ST000000000000000000002AMW42H';
const env = {
  NEXT_PUBLIC_STACKS_NETWORK: 'testnet',
  NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID: `${address}.arch7`,
  NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID: `${address}.proc7`,
};
test('requires explicit valid network and contracts', () => {
  for (const change of [{ NEXT_PUBLIC_STACKS_NETWORK: undefined },
    { NEXT_PUBLIC_STACKS_NETWORK: 'mainnet' },
    { NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID: `${address}.a/../b` },
    { NEXT_PUBLIC_STACKPAY_PROCESSOR_CONTRACT_ID: env.NEXT_PUBLIC_STACKPAY_ARCHITECTURE_CONTRACT_ID }]) {
    assert.throws(() => deploymentConfig({ ...env, ...change }));
  }
});
test('captures public source hashes and tx ids without declaring deployment verified', async () => {
  const result = await inspectDeployment(env, async (url, options) => {
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    const data = url.includes('/source/') ? { source: '(define-read-only (hello) true)' } :
      { contract_id: url.split('/').at(-1), tx_id: `0x${'a'.repeat(64)}` };
    return { ok: true, status: 200, json: async () => data };
  });
  assert.equal(result.available, true);
  assert.match(result.contracts[0].source_sha256, /^[0-9a-f]{64}$/);
  assert.ok(result.review_required);
});
test('404s, timeouts and malformed bodies fail closed', async () => {
  for (const fetcher of [async () => ({ ok: false, status: 404 }),
    async () => { throw new Error('sensitive proxy details'); },
    async () => ({ ok: true, status: 200, json: async () => ({}) })]) {
    const result = await inspectDeployment(env, fetcher);
    assert.equal(result.available, false);
    assert.equal(result.contracts[0].source_sha256, null);
    assert.ok(!JSON.stringify(result).includes('sensitive'));
  }
});
test('rejects an indexer response naming another contract', async () => {
  const result = await inspectDeployment(env, async url => ({ ok: true, status: 200,
    json: async () => url.includes('/source/') ? { source: '(ok true)' } :
      { contract_id: `${address}.other`, tx_id: `0x${'a'.repeat(64)}` },
  }));
  assert.equal(result.available, false);
});
