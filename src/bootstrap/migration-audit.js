const MIGRATION_FILE_PATTERN = /^(\d{3})_(.+)\.sql$/i;

/**
 * Destructive DDL patterns that should be warned about in migration files.
 * Each entry has a regex pattern and a human-readable description.
 */
const DESTRUCTIVE_DDL_PATTERNS = [
  { pattern: /\bDROP\s+TABLE\b/gi, description: 'DROP TABLE detected — may cause data loss' },
  {
    pattern: /\bALTER\s+TABLE\s+\w+\s+DROP\s+COLUMN\b/gi,
    description: 'ALTER TABLE DROP COLUMN detected — backward-incompatible schema change',
  },
  {
    pattern: /\bDROP\s+INDEX\b/gi,
    description: 'DROP INDEX detected — may degrade query performance',
  },
  {
    pattern: /\bDROP\s+TRIGGER\b/gi,
    description: 'DROP TRIGGER detected — may alter data integrity behavior',
  },
  {
    pattern: /\bRENAME\s+TABLE\b/gi,
    description: 'RENAME TABLE detected — may break existing queries',
  },
  {
    pattern: /\bALTER\s+TABLE\s+\w+\s+RENAME\s+COLUMN\b/gi,
    description: 'ALTER TABLE RENAME COLUMN detected — backward-incompatible schema change',
  },
];

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

  return {
    entries: sortedEntries,
    errors,
    ok: errors.length === 0,
  };
}

/**
 * Detect migration files that have been removed or renamed compared to a reference list.
 * @param {string[]} currentFiles - List of current migration filenames.
 * @param {string[]} previousFiles - List of previously known migration filenames (e.g. from git history).
 * @returns {{ removed: string[], renamed: Array<{from: string, to: string}>, errors: string[], ok: boolean }}
 */
export function detectRemovedMigrations(currentFiles = [], previousFiles = []) {
  const currentSet = new Set(currentFiles);
  const removed = [];
  const renamed = [];

  for (const prevFile of previousFiles) {
    if (!currentSet.has(prevFile)) {
      // Check if it was renamed: same prefix, different title
      const prevMatch = prevFile.match(MIGRATION_FILE_PATTERN);
      if (prevMatch) {
        const prevPrefix = prevMatch[1];
        const currentWithSamePrefix = currentFiles.find((f) => {
          const m = f.match(MIGRATION_FILE_PATTERN);
          return m && m[1] === prevPrefix && f !== prevFile;
        });

        if (currentWithSamePrefix) {
          renamed.push({ from: prevFile, to: currentWithSamePrefix });
        } else {
          removed.push(prevFile);
        }
      } else {
        removed.push(prevFile);
      }
    }
  }

  const errors = [];
  for (const file of removed) {
    errors.push(`Removed migration file detected: ${file} — migration files must never be removed`);
  }
  for (const { from, to } of renamed) {
    errors.push(
      `Renamed migration file detected: ${from} → ${to} — migration files must never be renamed`
    );
  }

  return {
    removed,
    renamed,
    errors,
    ok: errors.length === 0,
  };
}

/**
 * Scan SQL content for destructive DDL patterns.
 * @param {Object} fileContents - Map of filename → SQL content string.
 * @returns {{ warnings: Array<{file: string, line: number, pattern: string, description: string}>, ok: boolean }}
 */
export function scanDestructiveDDL(fileContents = {}) {
  const warnings = [];

  for (const [fileName, content] of Object.entries(fileContents)) {
    if (typeof content !== 'string') continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment-only lines
      const stripped = line.trim();
      if (stripped.startsWith('--') || stripped.length === 0) continue;

      for (const { pattern, description } of DESTRUCTIVE_DDL_PATTERNS) {
        if (pattern.test(line)) {
          warnings.push({
            file: fileName,
            line: i + 1,
            pattern: pattern.source,
            description,
          });
          // Reset lastIndex since we reuse pattern objects with /g flag
          pattern.lastIndex = 0;
        }
      }
    }
  }

  return {
    warnings,
    ok: warnings.length === 0,
  };
}
