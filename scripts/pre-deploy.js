#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const steps = [
  ['lint', ['pnpm', ['run', 'lint']]],
  ['format-check', ['pnpm', ['run', 'format:check']]],
  ['test', ['pnpm', ['run', 'test']]],
  ['coverage', ['pnpm', ['run', 'test:coverage']]],
  ['css', ['pnpm', ['run', 'build:css']]],
  ['migrations', ['node', ['scripts/validate-migrations.js']]],
  ['deploy-paths', ['node', ['scripts/check-deploy-paths.js']]],
];

const CONCURRENT_CHECK_COUNT = 4;
console.log('Running first 4 checks in parallel...');
const first4 = await Promise.all(
  steps.slice(0, CONCURRENT_CHECK_COUNT).map(async ([label, [cmd, args]]) => {
    console.log(`  ${label}...`);
    const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
    return { label, status: result.status };
  })
);

const failures = first4.filter((r) => r.status !== 0);
if (failures.length > 0) {
  for (const f of failures) {
    console.error(`✗ ${f.label} failed (exit ${f.status})`);
  }
  process.exit(1);
}

console.log('First 4 checks passed. Running CSS + migrations...');
for (let i = 4; i < steps.length; i++) {
  const [label, [cmd, args]] = steps[i];
  console.log(`  ${label}...`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('Pre-deploy checks passed.');
