#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const steps = [
  ['lint', ['pnpm', ['run', 'lint']]],
  ['format-check', ['pnpm', ['run', 'format:check']]],
  ['test', ['pnpm', ['test']]],
  ['coverage', ['pnpm', ['run', 'test:coverage']]],
  ['css', ['pnpm', ['run', 'build:css']]],
  ['migrations', ['node', ['scripts/validate-migrations.js']]],
];

for (const [label, [cmd, args]] of steps) {
  console.log(`Running ${label}...`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
console.log('Pre-deploy checks passed.');
