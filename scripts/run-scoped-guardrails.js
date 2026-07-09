#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

// Writable home directory for tools that try to write to ~/. (e.g., semgrep
// settings files fail under bwrap sandbox protection on the real home dir.)
const WRITABLE_HOME = process.env.HOME_SEMGREP || '/tmp/pi-home';

// Trusted local helper: shell disabled, args fixed by caller, no user input path.
function run(bin, args) {
  // nosemgrep: trusted local guardrail runner; no shell, fixed args only.
  const result = spawnSync(bin, args, { stdio: 'inherit', shell: false });
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
    // Pass writable HOME to avoid bwrap read-only filesystem errors on ~/.semgrep/.
    const result = spawnSync(
      'semgrep',
      [
        'scan',
        '--config',
        '.semgrep/rules.yml',
        '--error',
        '--baseline-commit',
        baseRef,
        ...semgrepFiles,
      ],
      { stdio: 'inherit', shell: false, env: { ...process.env, HOME: WRITABLE_HOME } }
    );
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}
