#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { auditMigrationFiles, scanDestructiveDDL } from '../src/bootstrap/migration-audit.js';

const migrationsDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), 'migrations');

const files = await readdir(migrationsDir);

// 1. Validate migration filenames (prefix format, no duplicates)
const report = auditMigrationFiles(files);

if (!report.ok) {
  console.error(`Migration audit failed for ${migrationsDir}`);
  for (const error of report.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Migration filename audit passed (${report.entries.length} migrations)`);

// 2. Scan for destructive DDL patterns (DROP TABLE, DROP COLUMN, RENAME, etc.)
const fileContents = {};
for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const content = await readFile(filePath, 'utf8');
  fileContents[file] = content;
}

const ddlReport = scanDestructiveDDL(fileContents);

if (ddlReport.warnings.length > 0) {
  console.warn(`\n⚠ Destructive DDL patterns detected in ${migrationsDir}:`);
  for (const warning of ddlReport.warnings) {
    console.warn(`  ${warning.file}:${warning.line} — ${warning.description}`);
  }
  // Warnings are non-blocking — they alert but don't fail CI
  // (destructive DDL may be intentional; review manually)
  console.warn('\nReview these patterns carefully before merging.');
} else {
  console.log('No destructive DDL patterns detected');
}

// TODO (#100 follow-up): Wire detectRemovedMigrations() once git-based
// previous-file detection is available in CI (requires fetching the
// main branch as a baseline for comparison).

console.log(`\nMigration audit passed for ${migrationsDir}`);
