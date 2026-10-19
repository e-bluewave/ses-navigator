import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./tests/browser/fixture', import.meta.url)),
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4179,
    strictPort: true,
    cors: false,
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
});
