#!/usr/bin/env node

/**
 * Snapshot budget auditor.
 *
 * Enforces two budget thresholds:
 *   - Max file count (default: 50)
 *   - Max total size in bytes (default: 5MB = 5 * 1024 * 1024)
 *
 * Scans Playwright snapshot directories (*-snapshots/) and Vitest
 * inline snapshot directories (__snapshots__/).
 *
 * Usage:
 *   node scripts/audit-snapshots.js [root-dir] [--max-files=50] [--max-size=5242880]
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

// --- Configuration ---
const DEFAULT_MAX_FILES = 50;
const BYTES_PER_MB = 1024 * 1024;
const DEFAULT_MAX_SIZE_MB = 5;
const DEFAULT_MAX_SIZE_BYTES = DEFAULT_MAX_SIZE_MB * BYTES_PER_MB; // 5MB

function parseMaxFilesArg(val) {
  if (!Number.isFinite(val) || val <= 0) {
    console.warn(`Warning: Invalid --max-files value ignored: ${val}`);
    return null;
  }
  return Math.floor(val);
}

function parseMaxSizeArg(val) {
  if (!Number.isFinite(val) || val <= 0) {
    console.warn(`Warning: Invalid --max-size value ignored: ${val}`);
    return null;
  }
  return val;
}

function isNotSnapshotDir(name) {
  return name === 'node_modules' || name === '.git';
}

function isSnapshotDir(name) {
  return name.endsWith('-snapshots') || name === '__snapshots__';
}

function parseArgs(argv) {
  const firstPositional = argv.find((a) => !a.startsWith('--'));
  let maxFiles = DEFAULT_MAX_FILES;
  let maxSize = DEFAULT_MAX_SIZE_BYTES;
  let scanDir = firstPositional || '.';

  for (const arg of argv) {
    if (arg.startsWith('--max-files=')) {
      const val = Number(arg.split('=')[1]);
      const parsed = parseMaxFilesArg(val);
      if (parsed !== null) maxFiles = parsed;
    }
    if (arg.startsWith('--max-size=')) {
      const val = Number(arg.split('=')[1]);
      const parsed = parseMaxSizeArg(val);
      if (parsed !== null) maxSize = parsed;
    }
  }

  return { maxFiles, maxSize, scanDir };
}

/**
 * Recursively collect snapshot files from directories matching
 * Playwright (*-snapshots/) and Vitest (__snapshots__/) conventions.
 */
async function collectSnapshotFiles(dir, files = []) {
  const entries = await readDirEntries(dir);

  for (const entry of entries) {
    if (isNotSnapshotDir(entry.name)) continue;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (isSnapshotDir(entry.name)) {
        await collectAllFiles(fullPath, files);
      } else {
        await collectSnapshotFiles(fullPath, files);
      }
    }
  }

  return files;
}

/**
 * Collect all files (recursively) from a given directory.
 */
async function collectAllFiles(dir, files = []) {
  const entries = await readDirEntries(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectAllFiles(fullPath, files);
    } else if (entry.isFile()) {
      const fileStat = await stat(fullPath);
      files.push({ path: fullPath, size: fileStat.size });
    }
  }

  return files;
}

function isMissingDirectoryError(err) {
  return err?.code === 'ENOENT';
}

function formatReadDirError(err, dir) {
  return new Error(`Failed to read directory "${dir}": ${err?.message ?? String(err)}`, {
    cause: err,
  });
}

/**
 * Read directory entries, returning [] on ENOENT.
 * Shared helper to reduce try/catch duplication.
 */
async function readDirEntries(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isMissingDirectoryError(err)) return [];
    throw formatReadDirError(err, dir);
  }
}

// --- Main ---
const { maxFiles, maxSize, scanDir } = parseArgs(process.argv.slice(2));

console.log(`Auditing snapshots in: ${scanDir}`);
console.log(`Budget: max ${maxFiles} files, max ${(maxSize / 1024 / 1024).toFixed(1)}MB total\n`);

const snapshotFiles = await collectSnapshotFiles(scanDir);

const totalSize = snapshotFiles.reduce((sum, f) => sum + f.size, 0);
const fileCount = snapshotFiles.length;

console.log(`Found ${fileCount} snapshot file(s) totaling ${(totalSize / 1024).toFixed(0)}KB`);

if (fileCount > 0) {
  console.log('');
  for (const f of snapshotFiles) {
    console.log(`  ${f.path} (${(f.size / 1024).toFixed(1)}KB)`);
  }
}

const errors = [];

if (fileCount > maxFiles) {
  errors.push(`Snapshot file count ${fileCount} exceeds budget of ${maxFiles}`);
}

if (totalSize > maxSize) {
  errors.push(
    `Snapshot total size ${(totalSize / 1024 / 1024).toFixed(2)}MB exceeds budget of ${(maxSize / 1024 / 1024).toFixed(1)}MB`
  );
}

if (errors.length > 0) {
  console.error('\n❌ Snapshot budget violations:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
} else {
  console.log('\n✅ Snapshot budget OK');
}
