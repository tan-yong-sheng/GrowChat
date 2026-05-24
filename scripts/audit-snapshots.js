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
const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function parseArgs(argv) {
  const firstPositional = argv.find((a) => !a.startsWith('--'));

  let maxFiles = DEFAULT_MAX_FILES;
  let maxSize = DEFAULT_MAX_SIZE_BYTES;
  let scanDir = firstPositional || '.';

  for (const arg of argv) {
    if (arg.startsWith('--max-files=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) maxFiles = Math.floor(val);
      else console.warn(`Warning: Invalid --max-files value ignored: ${arg}`);
    } else if (arg.startsWith('--max-size=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) maxSize = val;
      else console.warn(`Warning: Invalid --max-size value ignored: ${arg}`);
    }
  }

  return { maxFiles, maxSize, scanDir };
}

/**
 * Recursively collect snapshot files from directories matching
 * Playwright (*-snapshots/) and Vitest (__snapshots__/) conventions.
 */
async function collectSnapshotFiles(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code !== 'ENOENT')
      console.warn(`Warning: Could not read directory ${dir}: ${err.message}`);
    return files;
  }

  for (const entry of entries) {
    // Skip node_modules and .git
    if (entry.name === 'node_modules' || entry.name === '.git') continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.endsWith('-snapshots') || entry.name === '__snapshots__') {
        // This is a snapshot directory — collect all files within
        await collectAllFiles(fullPath, files);
      } else {
        // Recurse into non-snapshot directories
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
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code !== 'ENOENT')
      console.warn(`Warning: Could not read directory ${dir}: ${err.message}`);
    return files;
  }

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
