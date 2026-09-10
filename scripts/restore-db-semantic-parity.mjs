const createTablePattern =
  /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"(app|audit)")|(app|audit))\.(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_]*))\s*\(/gimu;

const copyHeaderPattern =
  /^COPY\s+(?:(?:"(app|audit)")|(app|audit))\.(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_]*))\s*\(([^\r\n]+)\)\s+FROM\s+stdin;\s*$/gimu;

export function parseExpectedApplicationTables(schemaSql) {
  const identities = new Set();
  for (const match of String(schemaSql ?? '').matchAll(createTablePattern)) {
    const schema = (match[1] ?? match[2]).toLowerCase();
    const table = decodeQuotedIdentifier(match[3] ?? match[4]);
    identities.add(identity(schema, table));
  }
  return [...identities].sort();
}

export function parseRestoredApplicationTables(stdout) {
  let rows;
  try {
    rows = JSON.parse(String(stdout ?? '').trim());
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;
  const identities = new Set();
  for (const row of rows) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      !['app', 'audit'].includes(row[0]) ||
      typeof row[1] !== 'string' ||
      row[1] === ''
    ) {
      return null;
    }
    identities.add(identity(row[0], row[1]));
  }
  return [...identities].sort();
}

export function compareApplicationTableSets(expected, restored) {
  if (!Array.isArray(expected) || !Array.isArray(restored)) {
    return {
      complete: false,
      missingTableCount: null,
      extraTableCount: null,
    };
  }
  const expectedSet = new Set(expected);
  const restoredSet = new Set(restored);
  const missingTableCount = [...expectedSet].filter(
    (value) => !restoredSet.has(value),
  ).length;
  const extraTableCount = [...restoredSet].filter(
    (value) => !expectedSet.has(value),
  ).length;
  return {
    complete: missingTableCount === 0 && extraTableCount === 0,
    missingTableCount,
    extraTableCount,
  };
}

export function parseBackupTombstones(dataSql) {
  const text = String(dataSql ?? '');
  const expectations = new Map();
  for (const match of text.matchAll(copyHeaderPattern)) {
    const schema = (match[1] ?? match[2]).toLowerCase();
    const table = decodeQuotedIdentifier(match[3] ?? match[4]);
    const columns = splitIdentifierList(match[5]).map((column) =>
      decodeQuotedIdentifier(column),
    );
    const deletedAtIndex = columns.indexOf('deleted_at');
    if (deletedAtIndex < 0) continue;

    const bodyStart = match.index + match[0].length;
    const terminatorMatch = /(?:^|\r?\n)\\\.\s*(?:\r?\n|$)/u.exec(
      text.slice(bodyStart),
    );
    if (!terminatorMatch) {
      throw new Error('COPY block terminator missing');
    }
    const rawBody = text.slice(bodyStart, bodyStart + terminatorMatch.index);
    const lines = rawBody
      .replace(/^\r?\n/u, '')
      .split(/\r?\n/u)
      .filter((line) => line !== '');
    let count = 0;
    for (const line of lines) {
      const values = line.split('\t');
      if (values.length <= deletedAtIndex) {
        throw new Error('COPY row has fewer columns than header');
      }
      if (values[deletedAtIndex] !== '\\N') count += 1;
    }
    const key = identity(schema, table);
    expectations.set(key, (expectations.get(key) ?? 0) + count);
  }
  return [...expectations.entries()]
    .map(([tableIdentity, expectedCount]) => ({
      tableIdentity,
      expectedCount,
    }))
    .sort((left, right) =>
      left.tableIdentity.localeCompare(right.tableIdentity),
    );
}

export function buildRestoredApplicationTablesSql() {
  return String.raw`
SELECT COALESCE(
  json_agg(json_build_array(n.nspname, c.relname) ORDER BY n.nspname, c.relname),
  '[]'::json
)::text
FROM pg_class AS c
JOIN pg_namespace AS n
  ON n.oid = c.relnamespace
WHERE n.nspname IN ('app', 'audit')
  AND c.relkind IN ('r', 'p');
`;
}

export function buildRestoredTombstoneSql(expectations) {
  if (!Array.isArray(expectations) || expectations.length === 0) {
    return null;
  }
  const expressions = expectations.map(({ tableIdentity }) => {
    const [schema, table] = splitIdentity(tableIdentity);
    return `(SELECT count(*)::integer FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} WHERE ${quoteIdentifier('deleted_at')} IS NOT NULL)`;
  });
  return `SELECT json_build_array(${expressions.join(', ')})::text;`;
}

export function parseRestoredTombstoneCounts(stdout, expectations) {
  let values;
  try {
    values = JSON.parse(String(stdout ?? '').trim());
  } catch {
    return null;
  }
  if (!Array.isArray(values) || values.length !== expectations.length) {
    return null;
  }
  if (!values.every((value) => Number.isInteger(value) && value >= 0)) {
    return null;
  }
  return expectations.map((expectation, index) => ({
    ...expectation,
    restoredCount: values[index],
  }));
}

export function summarizeTombstoneParity(comparisons) {
  if (!Array.isArray(comparisons)) {
    return {
      complete: false,
      tombstoneTableCount: null,
      expectedTombstoneCount: null,
      restoredTombstoneCount: null,
      tombstoneMismatchCount: null,
    };
  }
  const tombstoneMismatchCount = comparisons.filter(
    (item) => item.expectedCount !== item.restoredCount,
  ).length;
  return {
    complete: tombstoneMismatchCount === 0,
    tombstoneTableCount: comparisons.length,
    expectedTombstoneCount: comparisons.reduce(
      (sum, item) => sum + item.expectedCount,
      0,
    ),
    restoredTombstoneCount: comparisons.reduce(
      (sum, item) => sum + item.restoredCount,
      0,
    ),
    tombstoneMismatchCount,
  };
}

function splitIdentifierList(value) {
  const result = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      current += char;
      if (quoted && value[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (quoted) throw new Error('Unterminated quoted identifier');
  if (current.trim() !== '') result.push(current.trim());
  return result;
}

function decodeQuotedIdentifier(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/gu, '"');
  }
  return trimmed.replace(/""/gu, '"');
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/gu, '""')}"`;
}

function identity(schema, table) {
  return `${schema}\u0000${table}`;
}

function splitIdentity(value) {
  const separator = value.indexOf('\u0000');
  if (separator < 0) throw new Error('Invalid table identity');
  return [value.slice(0, separator), value.slice(separator + 1)];
}
