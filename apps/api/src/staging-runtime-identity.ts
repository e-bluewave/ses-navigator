import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";

const STAGING_PROJECT_ID = "prj_gpgM7keccxqbJpZssLH5UOBSb0OU";
const DEPLOYMENT_HOST =
  /^ses-navigator-staging-[a-z0-9]+-ebw-s-projects\.vercel\.app$/u;
const REF = /^[a-z0-9]{8,40}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;

function digest(ref: string): Buffer {
  return createHash("sha256").update(ref, "utf8").digest();
}

export function matchesStagingRuntimeIdentity(
  env: NodeJS.ProcessEnv,
  host: unknown,
  expectedCommit: unknown,
  stagingDigest: unknown,
  productionDigest: unknown,
): boolean {
  if (
    env.VERCEL_PROJECT_ID !== STAGING_PROJECT_ID ||
    env.VERCEL_ENV !== "preview" ||
    typeof env.VERCEL_URL !== "string" ||
    !DEPLOYMENT_HOST.test(env.VERCEL_URL) ||
    host !== env.VERCEL_URL ||
    typeof expectedCommit !== "string" ||
    !COMMIT.test(expectedCommit) ||
    env.VERCEL_GIT_COMMIT_SHA !== expectedCommit ||
    typeof stagingDigest !== "string" ||
    !DIGEST.test(stagingDigest) ||
    typeof productionDigest !== "string" ||
    !DIGEST.test(productionDigest) ||
    stagingDigest === productionDigest
  ) {
    return false;
  }
  try {
    const url = new URL(env.SUPABASE_URL ?? "");
    const match = /^([a-z0-9]{8,40})\.supabase\.co$/u.exec(url.hostname);
    if (
      url.protocol !== "https:" ||
      !match ||
      !REF.test(match[1]) ||
      url.port ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return false;
    }
    const actual = digest(match[1]);
    return (
      timingSafeEqual(actual, Buffer.from(stagingDigest, "hex")) &&
      !timingSafeEqual(actual, Buffer.from(productionDigest, "hex"))
    );
  } catch {
    return false;
  }
}

export function registerStagingRuntimeIdentityRoute(
  app: FastifyInstance,
): void {
  app.get("/internal/staging-runtime-identity", (request, reply) => {
    reply.header("cache-control", "no-store");
    const ok = matchesStagingRuntimeIdentity(
      process.env,
      request.headers.host,
      request.headers["x-sesn-expected-commit"],
      request.headers["x-sesn-staging-ref-sha256"],
      request.headers["x-sesn-production-ref-sha256"],
    );
    return reply.code(ok ? 204 : 404).send();
  });
}
