import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { isMainModule } from "./cli-entry.mjs";

const execFileAsync = promisify(execFile);
const PROJECT_ID = "prj_gpgM7keccxqbJpZssLH5UOBSb0OU";
const ORG_ID = "team_Wd9vCeAN0Q0MZCaqKXtVjRRw";
const HOST = /^ses-navigator-staging-[a-z0-9]+-ebw-s-projects\.vercel\.app$/u;
const REF = /^[a-z0-9]{8,40}$/u;
const SHA = /^[a-f0-9]{40}$/u;

export function assertStagingIdentityConfig(env, binding) {
  if (
    env.GITHUB_ACTIONS !== "true" ||
    env.SESN_READONLY_PREFLIGHT !== "true" ||
    binding?.projectId !== PROJECT_ID ||
    binding?.orgId !== ORG_ID ||
    !env.VERCEL_TOKEN
  ) {
    throw new Error("Staging identity job configuration is incomplete");
  }
  const staging = env.SESN_STAGING_SUPABASE_REF;
  const production = env.SESN_PRODUCTION_SUPABASE_REF;
  if (
    !REF.test(staging ?? "") ||
    !REF.test(production ?? "") ||
    staging === production ||
    !SHA.test(env.SESN_PR_HEAD_SHA ?? "")
  ) {
    throw new Error("Independent project identities or PR head are invalid");
  }
  let url;
  try {
    url = new URL(env.SESN_STAGING_IDENTITY_DEPLOYMENT_URL);
  } catch {
    throw new Error("Pinned Staging deployment URL is invalid");
  }
  if (
    url.protocol !== "https:" ||
    !HOST.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Pinned Staging deployment URL is invalid");
  }
  return { url: url.origin, staging, production, commit: env.SESN_PR_HEAD_SHA };
}

export async function runStagingIdentityCheck({
  env = process.env,
  binding,
  check,
  log = console.log,
} = {}) {
  const config = assertStagingIdentityConfig(env, binding);
  const hash = (ref) => createHash("sha256").update(ref).digest("hex");
  const headers = [
    "-H",
    `x-sesn-expected-commit: ${config.commit}`,
    "-H",
    `x-sesn-staging-ref-sha256: ${hash(config.staging)}`,
    "-H",
    `x-sesn-production-ref-sha256: ${hash(config.production)}`,
  ];
  const status = await check(
    `${config.url}/internal/staging-runtime-identity`,
    headers,
  );
  if (status !== "204")
    throw new Error("Staging runtime identity did not match");
  log(
    "Staging Vercel runtime Supabase project identity: PASS. No database or mail operation.",
  );
  return true;
}

async function protectedStatus(url, headers) {
  try {
    const result = await execFileAsync(
      "vercel",
      [
        "curl",
        url,
        "--",
        "--silent",
        "--output",
        "/dev/null",
        "--write-out",
        "%{http_code}",
        ...headers,
      ],
      {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          CI: "1",
          VERCEL_TOKEN: process.env.VERCEL_TOKEN,
        },
        timeout: 20_000,
        maxBuffer: 1024,
      },
    );
    return result.stdout.trim();
  } catch {
    throw new Error("Protected Staging identity GET failed");
  }
}

if (isMainModule(import.meta.url)) {
  try {
    const binding = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
    await runStagingIdentityCheck({ binding, check: protectedStatus });
  } catch {
    console.error(
      "Staging identity check stopped safely. No database or mail operation.",
    );
    process.exitCode = 1;
  }
}
