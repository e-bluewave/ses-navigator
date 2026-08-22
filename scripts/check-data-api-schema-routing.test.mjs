import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDataApiSchemaRouting } from './check-data-api-schema-routing.mjs';

const routed = {
  name: 'repository.ts',
  source: `import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';
fetch(\`https://example.test/rest/v1\${path}\`, {
  headers: { ...dataApiSchemaHeaders(path) },
});`,
};

test('accepts Data API request files with explicit schema routing', () => {
  const result = validateDataApiSchemaRouting([routed]);

  assert.equal(result.status, 'DATA_API_SCHEMA_ROUTING_PASSED');
  assert.equal(result.requestFileCount, 1);
  assert.deepEqual(result.failures, []);
});

test('rejects a Data API request without the shared import', () => {
  const result = validateDataApiSchemaRouting([
    {
      name: 'missing-import.ts',
      source:
        "fetch('https://example.test/rest/v1/projects'); dataApiSchemaHeaders(path);",
    },
  ]);

  assert.match(result.failures.join('\n'), /import missing/);
});

test('rejects a Data API request without schema headers', () => {
  const result = validateDataApiSchemaRouting([
    {
      name: 'missing-routing.ts',
      source:
        "import { dataApiSchemaHeaders } from '../../shared/supabase-schema.js';\n" +
        "fetch('https://example.test/rest/v1/projects');",
    },
  ]);

  assert.match(result.failures.join('\n'), /routing missing/);
});

test('ignores files that do not call the Data API', () => {
  const result = validateDataApiSchemaRouting([
    { name: 'route.ts', source: "app.get('/api/v1/projects', handler);" },
  ]);

  assert.equal(result.requestFileCount, 0);
  assert.equal(result.status, 'DATA_API_SCHEMA_ROUTING_PASSED');
});
