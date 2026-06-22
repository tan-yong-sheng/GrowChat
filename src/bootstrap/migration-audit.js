const MIGRATION_FILE_PATTERN = /^(\d{3})_(.+)\.sql$/i;

/**
 * Destructive DDL patterns that should be warned about in migration files.
 * Each entry has a regex pattern and a human-readable description.
 */
const DESTRUCTIVE_DDL_PATTERNS = [
  { pattern: /\bDROP\s+TABLE\b/gi, description: 'DROP TABLE detected — may cause data loss' },
  {
    pattern: /\bALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN\b/gi,
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
    pattern: /\bALTER\s+TABLE\s+\S+\s+RENAME\s+COLUMN\b/gi,
    description: 'ALTER TABLE RENAME COLUMN detected — backward-incompatible schema change',
  },
  {
    pattern: /\bALTER\s+TABLE\s+\S+\s+RENAME\s+TO\b/gi,
    description: 'ALTER TABLE RENAME TO detected — backward-incompatible schema change (SQLite/D1)',
  },
];

function processMigrationFile(name, entries, errors, seenPrefixes) {
  const match = name.match(MIGRATION_FILE_PATTERN);
  if (!match) {
    errors.push(`Invalid migration filename: ${name}`);
    return;
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

function deduplicateAndSortEntries(entries) {
  const uniqueEntries = entries.filter((entry, index, array) => {
    return array.findIndex((candidate) => candidate.prefix === entry.prefix) === index;
  });
  return uniqueEntries.slice().sort((a, b) => a.prefix - b.prefix);
}

export function auditMigrationFiles(fileNames = []) {
  const entries = [];
  const errors = [];
  const seenPrefixes = new Map();

  for (const fileName of Array.isArray(fileNames) ? [...fileNames].sort() : []) {
    const name = String(fileName || '').trim();
    if (!name) continue;
    processMigrationFile(name, entries, errors, seenPrefixes);
  }

  const sortedEntries = deduplicateAndSortEntries(entries);

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
 * Strip SQL comments and string literals from content while preserving line numbers.
 * Removes:
 * - Block comments (/* ... * /) \u2014 replaces non-newline chars with spaces
 * - String literals ('...' and "...") \u2014 replaces content with empty placeholder
 * - Inline comments (-- to end of line)
 *
 * @param {string} content - Raw SQL content.
 * @returns {string} Content with comments stripped, preserving line structure.
 */
function stripSqlComments(content) {
  // Remove block comments, preserving newlines for accurate line numbers
  let result = content.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '));
  // Remove string literals (avoid false positives on keywords inside data)
  result = result.replace(/'(?:[^']|'')*'/g, "''"); // Replace with empty-string literal
  result = result.replace(/"(?:[^"]|"")*"/g, '""'); // Replace with empty-quoted identifier
  // Remove inline comments (-- to end of line)
  result = result.replace(/--.*$/gm, '');
  return result;
}

/**
 * Normalize multiline SQL statements into single lines for pattern matching.
 * Collapses consecutive whitespace (including newlines) into single spaces
 * within each statement (delimited by semicolons).
 *
 * @param {string} content - SQL content (ideally comment-stripped).
 * @returns {{ lines: string[], lineMap: number[] }} Normalized lines and their original line numbers.
 */
function createStatementAccumulator() {
  return { lineMap: [], normalizedLines: [], buffer: '', startLine: 0 };
}

function finalizeAccumulator(acc) {
  if (acc.buffer.trim().length > 0) {
    acc.normalizedLines.push(acc.buffer.trim());
    acc.lineMap.push(acc.startLine);
  }
  return { lines: acc.normalizedLines, lineMap: acc.lineMap };
}

function accumulateLine(acc, line, lineIndex) {
  const trimmed = line.trim();
  if (trimmed.length === 0) return;
  if (acc.buffer.length === 0) acc.startLine = lineIndex + 1;
  acc.buffer += (acc.buffer.length > 0 ? ' ' : '') + trimmed.replace(/\s+/g, ' ');

  while (acc.buffer.includes(';')) {
    const semiIdx = acc.buffer.indexOf(';');
    const stmt = acc.buffer.substring(0, semiIdx + 1).trim();
    if (stmt.length > 0) {
      acc.normalizedLines.push(stmt);
      acc.lineMap.push(acc.startLine);
    }
    acc.buffer = acc.buffer.substring(semiIdx + 1).trim();
    if (acc.buffer.length > 0) acc.startLine = lineIndex + 1;
  }
}

function normalizeMultilineSQL(content) {
  const acc = createStatementAccumulator();
  const originalLines = content.split('\n');
  for (let i = 0; i < originalLines.length; i++) {
    accumulateLine(acc, originalLines[i], i);
  }
  return finalizeAccumulator(acc);
}

/**
 * Check if a SQL statement contains a safety guard (IF EXISTS / IF NOT EXISTS).
 * Guarded statements are considered safe and should not produce warnings.
 *
 * @param {string} sql - Normalized SQL statement.
 * @returns {boolean} True if the statement is guarded.
 */
function hasSafetyGuard(sql) {
  return /\bIF\s+(NOT\s+)?EXISTS\b/i.test(sql);
}

/**
 * Check a single normalized SQL line against destructive DDL patterns.
 * Skips lines that are guarded with IF EXISTS / IF NOT EXISTS.
 *
 * @param {string} line - Normalized SQL line.
 * @param {number} originalLine - Original line number.
 * @returns {Array<{file: string, line: number, pattern: string, description: string}>}
 */
function checkLineForDestructivePatterns(line, originalLine) {
  const result = [];
  for (const { pattern, description } of DESTRUCTIVE_DDL_PATTERNS) {
    if (pattern.test(line)) {
      if (hasSafetyGuard(line)) {
        pattern.lastIndex = 0;
        continue;
      }
      result.push({ line: originalLine, pattern: pattern.source, description });
      pattern.lastIndex = 0;
    }
  }
  return result;
}

/**
 * Scan SQL content for destructive DDL patterns.
 * Handles block comments, inline comments, and multiline statements.
 * Statements with IF EXISTS / IF NOT EXISTS guards are skipped.
 *
 * @param {Object} fileContents - Map of filename → SQL content string.
 * @returns {{ warnings: Array<{file: string, line: number, pattern: string, description: string}>, ok: boolean }}
 */
export function scanDestructiveDDL(fileContents = {}) {
  const warnings = [];

  for (const [fileName, content] of Object.entries(fileContents)) {
    if (typeof content !== 'string') continue;

    const stripped = stripSqlComments(content);
    const { lines, lineMap } = normalizeMultilineSQL(stripped);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const originalLine = lineMap[i];

      if (line.trim().length === 0) continue;

      const lineWarnings = checkLineForDestructivePatterns(line, originalLine);
      for (const w of lineWarnings) {
        warnings.push({ file: fileName, ...w });
      }
    }
  }

  return {
    warnings,
    ok: warnings.length === 0,
  };
}
