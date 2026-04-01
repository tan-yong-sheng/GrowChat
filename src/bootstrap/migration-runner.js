import { readdir } from 'node:fs/promises';
import { auditMigrationFiles } from './migration-audit.js';

export async function listMigrationFileNames(migrationsDir) {
  const fileNames = await readdir(migrationsDir);
  const report = auditMigrationFiles(fileNames);

  if (!report.ok) {
    const error = new Error(`Invalid migration files in ${migrationsDir}`);
    error.details = report.errors;
    throw error;
  }

  return report.entries.map((entry) => entry.fileName);
}
