import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const webSrcRoot = path.join(repoRoot, 'apps', 'web', 'src');
const residues = [];

for (const entry of await readdir(webSrcRoot, { recursive: true })) {
  if (entry.endsWith('.js')) {
    residues.push(
      path
        .join('apps', 'web', 'src', entry)
        .split(path.sep)
        .join('/'),
    );
  }
}

const viteJsPath = path.join(repoRoot, 'apps', 'web', 'vite.config.js');

try {
  await access(viteJsPath);
  residues.push('apps/web/vite.config.js');
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

residues.sort();

if (residues.length > 0) {
  console.error(
    'Generated JavaScript is shadowing or can shadow the TypeScript web source:',
  );
  for (const residue of residues) {
    console.error(`- ${residue}`);
  }
  console.error(
    'Delete the generated JS residue before running the web dev server or build.',
  );
  process.exitCode = 1;
} else {
  console.log('Web source JS residue check: PASS');
}
