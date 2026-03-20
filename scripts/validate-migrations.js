#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { auditMigrationFiles } from '../src/bootstrap/migration-audit.js';

const migrationsDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), 'migrations');

const files = await readdir(migrationsDir);
const report = auditMigrationFiles(files);

if (!report.ok) {
  console.error(`Migration audit failed for ${migrationsDir}`);
  for (const error of report.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Migration audit passed for ${migrationsDir} (${report.entries.length} migrations)`);
