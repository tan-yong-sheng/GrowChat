#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const persistTo = process.env.WRANGLER_PERSIST_TO || '.wrangler/state';

const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'migrations', 'apply', 'growchat', '--local', '--persist-to', persistTo],
  {
    stdio: 'inherit',
    shell: true,
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
