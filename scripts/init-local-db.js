#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'growchat', '--local', '--persist-to', '.wrangler/state'], {
  stdio: 'inherit',
  shell: true,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
