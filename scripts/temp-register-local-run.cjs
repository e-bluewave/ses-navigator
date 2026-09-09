const fs = require('node:fs');
const path = 'package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.scripts['security:restore-local-run'] =
  'node scripts/restore-drill-local-run.mjs';
pkg.scripts['security:restore-local-run:check'] =
  'node --test scripts/restore-drill-local-run.test.mjs';
fs.writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
