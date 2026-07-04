#!/usr/env/bin node
import { execSync } from 'node:child_process';

const steps = [
  ['lint', `pnpm run lint`],
  ['format-check', `pnpm run format:check`],
  ['test', `pnpm run test`],
  ['coverage', `pnpm run test:coverage`],
  ['css', `pnpm run build:css`],
  ['migrations', `node scripts/validate-migrations.js`],
  ['deploy-paths', `node scripts/check-deploy-paths.js`],
];

const CONCURRENT_CHECK_COUNT = 4;
console.log('Running first 4 checks in parallel...');
const first4 = await Promise.all(
  steps.slice(0, CONCURRENT_CHECK_COUNT).map(async ([label, cmd]) => {
    console.log(`  ${label}...`);
    try {
      execSync(cmd, { stdio: 'inherit' });
      return { label, status: 0 };
    } catch {
      return { label, status: 1 };
    }
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
  const [label, cmd] = steps[i];
  console.log(`  ${label}...`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}

console.log('Pre-deploy checks passed.');
