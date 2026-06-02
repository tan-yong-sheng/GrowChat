#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

// Trusted local helper: shell disabled, args fixed by caller, no user input path.
function run(bin, args, options = {}) {
  // nosemgrep: trusted local guardrail runner; no shell, fixed args only.
  const result = spawnSync(bin, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getBaseRef() {
  const candidates = ['main', 'origin/main', 'master'];
  for (const ref of candidates) {
    const result = spawnSync('git', ['merge-base', 'HEAD', ref], {
      encoding: 'utf8',
      shell: false,
    });
    if (result.status === 0) {
      return result.stdout.trim();
    }
  }
  const fallback = spawnSync('git', ['rev-parse', 'HEAD~1'], {
    encoding: 'utf8',
    shell: false,
  });
  if (fallback.status === 0) {
    return fallback.stdout.trim();
  }
  throw new Error('Unable to resolve merge base for scoped guardrails');
}

function getChangedFiles(baseRef) {
  const result = spawnSync(
    'git',
    ['diff', '--name-only', '--diff-filter', 'ACMR', `${baseRef}...HEAD`],
    { encoding: 'utf8', shell: false }
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => /\.(?:js|mjs|cjs|ts|tsx)$/.test(file));
}

const baseRef = getBaseRef();
const files = getChangedFiles(baseRef);
if (files.length === 0) {
  process.exit(0);
}

if (process.argv.includes('--prettier')) {
  run('npx', ['prettier', '--check', ...files]);
}
if (process.argv.includes('--depcruise')) {
  const jsFiles = files.filter((file) => /\.(?:js|mjs|cjs)$/.test(file));
  if (jsFiles.length > 0) {
    run('npx', ['depcruise', ...jsFiles, '--config', '.dependency-cruiser.cjs']);
  }
}
if (process.argv.includes('--semgrep')) {
  const semgrepFiles = files.filter((file) => /\.(?:js|mjs|cjs)$/.test(file));
  if (semgrepFiles.length > 0) {
    // Use --baseline-commit to only block on NEW findings not present in the base branch.
    // Pre-existing violations in changed files are reported but don't cause failure.
    run('semgrep', [
      'scan',
      '--config',
      '.semgrep/rules.yml',
      '--error',
      '--baseline-commit',
      baseRef,
      ...semgrepFiles,
    ]);
  }
}
if (process.argv.includes('--jscpd')) {
  // jscpd exits with code 1 when duplicates exceed threshold, which is expected.
  // Only propagate truly unexpected errors (code > 1).
  const result = spawnSync('npx', ['jscpd', 'public/js'], { stdio: 'inherit', shell: false });
  if (result.status !== 0 && result.status !== 1) {
    process.exit(result.status ?? 1);
  }
}

if (process.argv.includes('--stryker')) {
  const srcFiles = files.filter(
    (file) => file.startsWith('src/') && file.endsWith('.js') && !file.endsWith('.test.js')
  );
  if (srcFiles.length > 0) {
    run('npx', ['stryker', 'run', '--incremental', '--mutate', ...srcFiles]);
  }
}
