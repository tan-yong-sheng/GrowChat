const MIGRATION_FILE_PATTERN = /^(\d{3})_(.+)\.sql$/i;

export function auditMigrationFiles(fileNames = []) {
  const entries = [];
  const errors = [];
  const seenPrefixes = new Map();

  for (const fileName of Array.isArray(fileNames) ? [...fileNames].sort() : []) {
    const name = String(fileName || '').trim();
    if (!name) continue;
    const match = name.match(MIGRATION_FILE_PATTERN);
    if (!match) {
      errors.push(`Invalid migration filename: ${name}`);
      continue;
    }

    const prefix = Number(match[1]);
    const title = match[2];
    const entry = { fileName: name, prefix, title };
    entries.push(entry);

    const existing = seenPrefixes.get(prefix);
    if (existing) {
      errors.push(`Duplicate migration prefix ${match[1]}: ${existing.fileName}, ${name}`);
    } else {
      seenPrefixes.set(prefix, entry);
    }
  }

  const uniqueEntries = entries.filter((entry, index, array) => {
    return array.findIndex((candidate) => candidate.prefix === entry.prefix) === index;
  });
  const sortedEntries = uniqueEntries.slice().sort((a, b) => a.prefix - b.prefix);

  for (let index = 0; index < sortedEntries.length; index += 1) {
    const expectedPrefix = index + 1;
    const actualPrefix = sortedEntries[index].prefix;
    if (actualPrefix !== expectedPrefix) {
      errors.push(
        `Migration order gap at ${sortedEntries[index].fileName}: expected ${String(expectedPrefix).padStart(3, '0')}`
      );
      break;
    }
  }

  return {
    entries: sortedEntries,
    errors,
    ok: errors.length === 0,
  };
}
