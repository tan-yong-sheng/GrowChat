#!/usr/env/bin node
import { execSync } from 'node:child_process';

const steps = [
  ['typecheck', 'pnpm run typecheck'],
  ['format:check', 'pnpm run format:check'],
  ['build:css', 'pnpm run build:css'],
  ['validate:migrations', 'pnpm run validate:migrations'],
  ['lint:hygiene', 'pnpm run lint:hygiene'],
  ['lint:dupes', 'pnpm run lint:dupes'],
  ['lint:security', 'pnpm run lint:security'],
  ['lint:flags', 'pnpm run lint:flags'],
];

for (const [label, cmd] of steps) {
  console.log(`  ${label}...`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}

console.log('Pre-deploy checks passed.');