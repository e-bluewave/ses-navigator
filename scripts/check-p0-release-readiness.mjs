import { readFile } from 'node:fs/promises';
import { isMainModule } from './cli-entry.mjs';

const expectedIds = Array.from({ length: 20 }, (_, index) => `BA-${String(index + 1).padStart(3, '0')}`);
const allowedStatuses = new Set(['verified', 'pending', 'deferred']);

export function evaluateP0ReleaseReadiness(policy) {
  const failures = [];
  const items = Array.isArray(policy?.items) ? policy.items : [];

  if (policy?.version !== 1) failures.push('policy version must be 1');
  if (policy?.scope !== 'p0-release-readiness') {
    failures.push('scope must be p0-release-readiness');
  }
  if (policy?.requireAllP0Verified !== true) {
    failures.push('all P0 items must be verified before Production');
  }

  const ids = items.map((item) => item?.id);
  if (new Set(ids).size !== ids.length) failures.push('P0 item IDs must be unique');

  for (const id of expectedIds) {
    if (!ids.includes(id)) failures.push(`missing P0 item: ${id}`);
  }
  for (const id of ids) {
    if (!expectedIds.includes(id)) failures.push(`unexpected P0 item: ${id}`);
  }

  for (const item of items) {
    if (!allowedStatuses.has(item?.status)) {
      failures.push(`invalid status for ${item?.id ?? 'unknown'}`);
    }
    if (typeof item?.evidence !== 'string' || item.evidence.trim() === '') {
      failures.push(`evidence is required for ${item?.id ?? 'unknown'}`);
    }
  }

  const verified = items.filter((item) => item.status === 'verified').map((item) => item.id);
  const pending = items.filter((item) => item.status === 'pending').map((item) => item.id);
  const deferred = items.filter((item) => item.status === 'deferred').map((item) => item.id);
  const productionReady =
    failures.length === 0 &&
    items.length === expectedIds.length &&
    items.every((item) => item.status === 'verified');

  if (policy?.productionReady !== productionReady) {
    failures.push('declared productionReady must match computed readiness');
  }

  return {
    status: failures.length === 0 ? 'P0_RELEASE_READINESS_POLICY_PASSED' : 'P0_RELEASE_READINESS_POLICY_FAILED',
    productionReady,
    verified,
    pending,
    deferred,
    failures,
  };
}

export async function runP0ReleaseReadinessCheck({
  policyPath = 'ops/p0-release-readiness.json',
  requireReady = false,
  log = console.log,
} = {}) {
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const result = evaluateP0ReleaseReadiness(policy);
  log(JSON.stringify(result, null, 2));

  if (result.failures.length > 0) {
    throw new Error(`P0 release readiness policy check failed (${result.failures.length})`);
  }
  if (requireReady && !result.productionReady) {
    throw new Error('Production release blocked: unresolved P0 items remain');
  }

  return result;
}

if (isMainModule(import.meta.url)) {
  runP0ReleaseReadinessCheck({ requireReady: process.argv.includes('--require-ready') }).catch((error) => {
    console.error(error instanceof Error ? error.message : 'P0 release readiness check failed');
    process.exitCode = 1;
  });
}
