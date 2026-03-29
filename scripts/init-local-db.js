#!/usr/bin/env node

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { listMigrationFileNames } from '../src/bootstrap/migration-runner.js';

const migrationsDir = path.resolve(process.cwd(), 'migrations');
const migrationFiles = await listMigrationFileNames(migrationsDir);

for (const fileName of migrationFiles) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'growchat', '--local', `--file=./migrations/${fileName}`, '-y'],
    { stdio: 'inherit', shell: true }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
