const branch = 'codex/issue-167-microsoft-graph-mail-provider';
const publicNames = new Set([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
]);

// Build configuration assertions only. These inputs do not prove runtime
// identity, token signatures, deployment protection or API/database isolation.
export function assertStagingWebBuildEnvironment(env) {
  const deny = () => {
    // Never include input names, values, URLs, refs or parser errors in output.
    throw new Error('Staging Web build configuration rejected');
  };
  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && !publicNames.has(name)) deny();
  }
  const stage = env.SESN_STAGING_SUPABASE_REF;
  const production = env.SESN_PRODUCTION_SUPABASE_REF;
  if (
    env.VERCEL !== '1' ||
    env.VERCEL_ENV !== 'preview' ||
    env.VERCEL_GIT_REPO_OWNER !== 'e-bluewave' ||
    env.VERCEL_GIT_REPO_SLUG !== 'ses-navigator' ||
    env.VERCEL_GIT_COMMIT_REF !== branch ||
    !/^[a-f0-9]{40}$/u.test(env.VERCEL_GIT_COMMIT_SHA ?? '') ||
    !/^prj_[A-Za-z0-9]+$/u.test(env.SESN_STAGING_WEB_VERCEL_PROJECT_ID ?? '') ||
    env.VERCEL_PROJECT_ID !== env.SESN_STAGING_WEB_VERCEL_PROJECT_ID ||
    !/^[a-z0-9]{20}$/u.test(stage ?? '') ||
    !/^[a-z0-9]{20}$/u.test(production ?? '') ||
    stage === production
  )
    deny();
  let url;
  try {
    url = new URL(env.VITE_SUPABASE_URL);
  } catch {
    deny();
  }
  if (
    url.origin !== `https://${stage}.supabase.co` ||
    !['', '/'].includes(url.pathname) ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  )
    deny();
  const keys = [
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    env.VITE_SUPABASE_ANON_KEY,
  ].filter((key) => key !== undefined);
  if (!keys.length) deny();
  for (const key of keys) {
    if (typeof key !== 'string' || !key || key.length > 8192 || /\s/u.test(key))
      deny();
    if (/^sb_publishable_[A-Za-z0-9_-]+$/u.test(key)) continue;
    // Decode solely to reject privileged/mismatched legacy keys. This is NOT
    // signature validation and cannot attest a key's ownership or validity.
    try {
      const parts = key.split('.');
      if (
        parts.length !== 3 ||
        parts.some((part) => !/^[A-Za-z0-9_-]+$/u.test(part))
      )
        deny();
      const claim = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      );
      if (claim.role !== 'anon' || claim.ref !== stage) deny();
    } catch {
      deny();
    }
  }
}
