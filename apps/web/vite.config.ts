import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { assertStagingWebBuildEnvironment } from '../../scripts/lib/staging-web-build-guard.mjs';

export default defineConfig(({ command, mode }) => {
  if (
    command === 'build' &&
    (mode === 'staging' || process.env.VERCEL === '1')
  ) {
    const identityNames = [
      'SESN_STAGING_WEB_VERCEL_PROJECT_ID',
      'SESN_STAGING_SUPABASE_REF',
      'SESN_PRODUCTION_SUPABASE_REF',
    ];
    const loaded = loadEnv(mode, process.cwd(), ['VITE_', ...identityNames]);
    const buildEnv: Record<string, string | undefined> = {};
    for (const name of Object.keys(loaded)) {
      if (name.startsWith('VITE_')) buildEnv[name] = loaded[name];
    }
    for (const name of Object.keys(process.env)) {
      if (name.startsWith('VITE_')) buildEnv[name] = process.env[name];
    }
    for (const name of identityNames) {
      buildEnv[name] = process.env[name] ?? loaded[name];
    }
    assertStagingWebBuildEnvironment({
      ...buildEnv,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
      VERCEL_GIT_REPO_OWNER: process.env.VERCEL_GIT_REPO_OWNER,
      VERCEL_GIT_REPO_SLUG: process.env.VERCEL_GIT_REPO_SLUG,
      VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    });
  }
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  };
});
