import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { isMainModule } from './cli-entry.mjs';

test('recognizes the current platform entry path', () => {
  const entryPath = process.argv[1];

  assert.equal(isMainModule(pathToFileURL(entryPath).href, entryPath), true);
});

test('recognizes a Windows entry after URL conversion', () => {
  const windowsPath = 'C:\\repo\\scripts\\runner.mjs';
  const windowsUrl = 'file:///C:/repo/scripts/runner.mjs';

  assert.equal(
    isMainModule(windowsUrl, windowsPath, () => ({ href: windowsUrl })),
    true,
  );
});

test('rejects imports and missing entry paths', () => {
  const entryPath = process.argv[1];

  assert.equal(isMainModule('file:///different.mjs', entryPath), false);
  assert.equal(isMainModule(pathToFileURL(entryPath).href, null), false);
});
