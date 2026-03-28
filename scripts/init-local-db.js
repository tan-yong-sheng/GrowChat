#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'growchat', '--local', '--file=./migrations/001_initial.sql', '-y'],
  { stdio: 'inherit', shell: true }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
