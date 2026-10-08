import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isMainModule } from './cli-entry.mjs';

const execFileAsync = promisify(execFile);
const DEPLOYMENT =
  'https://ses-navigator-staging-3y5w7tmtx-ebw-s-projects.vercel.app';
const PROJECT_ID = 'prj_gpgM7keccxqbJpZssLH5UOBSb0OU';
const ORG_ID = 'team_Wd9vCeAN0Q0MZCaqKXtVjRRw';
const EXPECTED_TO = 'info@e-bluewave.com';
const EXPECTED_SUBJECT = 'SES Navigator SMTP Staging Test';
const EXPECTED_BODY =
  'SES Navigator Staging環境からのSMTP送信テストです。\n受信確認用のテストメールです。';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_PAGES = 10;

export function assertCloudConfiguration(env, binding) {
  if (env.GITHUB_ACTIONS !== 'true' || env.SESN_READONLY_PREFLIGHT !== 'true') {
    throw new Error(
      'Cloud preflight must run in the dedicated GitHub Actions job',
    );
  }
  if (binding?.projectId !== PROJECT_ID || binding?.orgId !== ORG_ID) {
    throw new Error('Vercel project binding is not the pinned Staging project');
  }
  const ref = env.SESN_STAGING_SUPABASE_REF;
  if (!/^[a-z0-9]{8,40}$/u.test(ref ?? '')) {
    throw new Error(
      'Independent Staging Supabase project ref is missing or invalid',
    );
  }
  let url;
  try {
    url = new URL(env.SUPABASE_URL);
  } catch {
    throw new Error('Staging Supabase URL is invalid');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== `${ref}.supabase.co` ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Staging Supabase URL does not match the independent project ref',
    );
  }
  if (
    !env.SUPABASE_ANON_KEY ||
    !env.VERCEL_TOKEN ||
    !env.SESN_STAGING_TEST_EMAIL ||
    !env.SESN_STAGING_TEST_PASSWORD
  ) {
    throw new Error('Staging read-only credentials are missing');
  }
  if (
    env.MESSAGE_DELIVERY_PROVIDER !== 'smtp' ||
    env.SMTP_HOST !== 'mail.e-bluewave.com' ||
    env.SMTP_PORT !== '587' ||
    env.SMTP_SECURE !== 'false' ||
    env.SMTP_USERNAME !== 'yamaguchi@e-bluewave.com' ||
    env.SMTP_SENDER !== 'yamaguchi@e-bluewave.com'
  ) {
    throw new Error(
      'Staging SMTP settings do not match the approved configuration',
    );
  }
  return url.origin;
}

function exactlyOneRecipient(recipients) {
  return (
    Array.isArray(recipients) &&
    recipients.length === 1 &&
    typeof recipients[0]?.address === 'string' &&
    recipients[0].address.trim().toLowerCase() === EXPECTED_TO
  );
}

export async function runStagingReadOnlyPreflight({
  env = process.env,
  binding,
  fetchImpl = fetch,
  getProtectedJson,
  log = console.log,
} = {}) {
  const authOrigin = assertCloudConfiguration(env, binding);
  const anonKey = env.SUPABASE_ANON_KEY;
  const email = env.SESN_STAGING_TEST_EMAIL;
  const password = env.SESN_STAGING_TEST_PASSWORD;
  // The Vercel Production-target environment belongs to the Staging project.
  // Do not pass unrelated secrets (including SMTP_PASSWORD) to the CLI child.
  for (const name of [
    'SMTP_PASSWORD',
    'DATABASE_URL',
    'POSTGRES_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
    'SESN_STAGING_TEST_PASSWORD',
  ]) {
    delete env[name];
  }

  const health = await getProtectedJson('/health');
  if (health?.status !== 'ok')
    throw new Error('Pinned Staging deployment health failed');

  // Supabase Auth password grant is the only POST; application data calls are GET.
  let response;
  try {
    response = await fetchImpl(
      `${authOrigin}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: { apikey: anonKey, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new Error('Staging Supabase Auth request failed');
  }
  if (!response.ok) throw new Error('Staging Supabase Auth login failed');
  let session;
  try {
    session = await response.json();
  } catch {
    /* sanitized below */
  }
  if (typeof session?.access_token !== 'string' || !session.access_token) {
    throw new Error('Staging Supabase Auth did not return an access token');
  }
  const accessToken = session.access_token;
  session = undefined;

  let cursor;
  let complete = false;
  let matches = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const path = `/api/v1/proposals?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const list = await getProtectedJson(path, accessToken);
    if (!Array.isArray(list?.items))
      throw new Error('Proposal list is malformed');
    for (const proposal of list.items) {
      if (!UUID.test(proposal?.id))
        throw new Error('Proposal identifier is malformed');
      const draft = await getProtectedJson(
        `/api/v1/proposals/${proposal.id}/ai/message-drafts/latest`,
        accessToken,
      );
      if (draft?.subject !== EXPECTED_SUBJECT) continue;
      if (
        !UUID.test(draft?.id) ||
        draft.proposalId !== proposal.id ||
        draft.status !== 'approved' ||
        typeof draft.approvedVersionId !== 'string' ||
        !draft.approvedVersionId ||
        draft.bodyText !== EXPECTED_BODY ||
        !exactlyOneRecipient(draft.recipients)
      ) {
        throw new Error('Matching subject has an unexpected draft or approval');
      }
      const delivery = await getProtectedJson(
        `/api/v1/proposals/${proposal.id}/messages/${draft.id}/delivery`,
        accessToken,
      );
      if (
        delivery?.proposalId !== proposal.id ||
        delivery.messageId !== draft.id ||
        delivery.status !== 'approved' ||
        delivery.approvedVersionId !== draft.approvedVersionId ||
        !exactlyOneRecipient(delivery.recipients) ||
        !Array.isArray(delivery.recipients[0].attempts) ||
        delivery.recipients[0].attempts.length !== 0
      ) {
        throw new Error(
          'Delivery recipient, approval or attempt count does not match',
        );
      }
      matches++;
      if (matches > 1)
        throw new Error('Approved Staging message is not unique');
    }
    if (list.items.length > 200)
      throw new Error('Proposal page exceeds the scan limit');
    cursor = list.page?.nextCursor;
    if (!cursor) {
      complete = true;
      break;
    }
    if (list.items.length === 0)
      throw new Error('Proposal pagination ended unexpectedly');
    if (typeof cursor !== 'string')
      throw new Error('Proposal cursor is malformed');
  }
  if (!complete)
    throw new Error('Proposal scan limit reached before uniqueness was proven');
  if (matches !== 1)
    throw new Error('Approved Staging message was not found uniquely');
  log(
    'Staging protected GET, authenticated read, exact recipient/subject/body, approval, attempt=0: PASS (unique match). No mail sent.',
  );
  return { status: 'PASSED', matches: 1 };
}

async function getVercelJson(path, accessToken) {
  const headers = accessToken
    ? ['-H', `Authorization: Bearer ${accessToken}`]
    : [];
  // No shell. Suppress raw CLI errors and response bodies from failure logs.
  let output;
  try {
    output = await execFileAsync(
      'vercel',
      ['curl', `${DEPLOYMENT}${path}`, '--', '--silent', '--fail', ...headers],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          CI: '1',
          VERCEL_TOKEN: process.env.VERCEL_TOKEN,
        },
        timeout: 20_000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
  } catch {
    throw new Error('Protected Staging GET failed');
  }
  try {
    return JSON.parse(output.stdout);
  } catch {
    throw new Error('Protected Staging GET did not return JSON');
  }
}

if (isMainModule(import.meta.url)) {
  let binding;
  try {
    binding = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
    await runStagingReadOnlyPreflight({
      binding,
      getProtectedJson: getVercelJson,
    });
  } catch {
    // Never print exception details: a network/CLI error may contain credentials.
    console.error('Staging read-only preflight stopped safely. No mail sent.');
    process.exitCode = 1;
  }
}
