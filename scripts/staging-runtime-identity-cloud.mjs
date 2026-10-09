import { createHash } from 'node:crypto';
import { isMainModule } from './cli-entry.mjs';

const BRANCH_HOST =
  'ses-navigator-staging-git-codex-issue-167-b1ce58-ebw-s-projects.vercel.app';
const REF = /^[a-z0-9]{8,40}$/u;
const SHA = /^[a-f0-9]{40}$/u;

export function assertStagingIdentityConfig(env) {
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_EVENT_NAME !== 'pull_request' ||
    env.GITHUB_REPOSITORY !== 'e-bluewave/ses-navigator' ||
    env.GITHUB_HEAD_REF !== 'codex/issue-167-microsoft-graph-mail-provider' ||
    env.SESN_READONLY_PREFLIGHT !== 'true' ||
    !env.ACTIONS_ID_TOKEN_REQUEST_URL ||
    !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  ) {
    throw new Error('Staging identity job configuration is incomplete');
  }
  const staging = env.SESN_STAGING_SUPABASE_REF;
  const production = env.SESN_PRODUCTION_SUPABASE_REF;
  if (
    !REF.test(staging ?? '') ||
    !REF.test(production ?? '') ||
    staging === production ||
    !SHA.test(env.SESN_PR_HEAD_SHA ?? '')
  ) {
    throw new Error('Independent project identities or PR head are invalid');
  }
  return { staging, production, commit: env.SESN_PR_HEAD_SHA };
}

async function githubOidcToken(env, fetchImpl = fetch) {
  try {
    const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith('.actions.githubusercontent.com')
    ) {
      throw new Error('Invalid OIDC issuer endpoint');
    }
    url.searchParams.set('audience', 'https://github.com/e-bluewave');
    const response = await fetchImpl(url, {
      headers: {
        authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('OIDC request failed');
    const data = await response.json();
    if (typeof data?.value !== 'string' || !data.value) {
      throw new Error('OIDC token missing');
    }
    return data.value;
  } catch {
    throw new Error('GitHub Actions OIDC token could not be obtained');
  }
}

async function protectedStatus(headers, token, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(
      `https://${BRANCH_HOST}/internal/staging-runtime-identity`,
      {
        method: 'GET',
        headers: {
          ...headers,
          'x-vercel-trusted-oidc-idp-token': token,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      },
    );
    return response.status;
  } catch {
    throw new Error('Protected Staging identity GET failed');
  }
}

export async function runStagingIdentityCheck({
  env = process.env,
  getToken = githubOidcToken,
  check = protectedStatus,
  log = console.log,
} = {}) {
  const config = assertStagingIdentityConfig(env);
  const hash = (ref) => createHash('sha256').update(ref).digest('hex');
  const token = await getToken(env);
  const status = await check(
    {
      'x-sesn-expected-commit': config.commit,
      'x-sesn-staging-ref-sha256': hash(config.staging),
      'x-sesn-production-ref-sha256': hash(config.production),
    },
    token,
  );
  if (status !== 204) throw new Error('Staging runtime identity did not match');
  log(
    'Staging runtime Supabase project identity: PASS. No database or mail operation.',
  );
  return true;
}

if (isMainModule(import.meta.url)) {
  try {
    await runStagingIdentityCheck();
  } catch {
    console.error(
      'Staging identity check stopped safely. No database or mail operation.',
    );
    process.exitCode = 1;
  }
}
