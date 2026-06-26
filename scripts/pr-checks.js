#!/usr/bin/env node
/**
 * Lightweight offline PR semantic checks.
 *
 * Replaces `danger ci` after the latter consistently failed on large PRs
 * with `ERR_STREAM_PREMATURE_CLOSE` (node-fetch v2 + gzipped GitHub API
 * responses — see commits 79302233 and 6b795700 for context).
 *
 * The original dangerfile.js only enforced two rules, both of which can be
 * evaluated without any third-party CI library:
 *
 *   1. PR body must be at least 10 characters long.
 *   2. If package.json is modified, pnpm-lock.yaml must also be modified.
 *
 * Inputs:
 *   - PR_BODY env var: the raw PR body text (set by the workflow from
 *     github.event.pull_request.body).
 *   - PR_BASE_REF env var: the base ref to diff against (default: origin/main).
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed (or git diff failed)
 *
 * The check is fully offline; it never makes a network call.
 */
import { spawnSync } from 'node:child_process';

const MIN_BODY_LENGTH = 10;
const DEFAULT_BASE_REF = 'origin/main';

/** Run `git diff --name-only <base>...HEAD` and return the list of changed file paths. */
function getChangedFiles(baseRef) {
  const result = spawnSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`[pr-checks] git diff failed (exit ${result.status}):`, result.stderr);
    process.exit(1);
  }
  return result.stdout.split('\n').filter(Boolean);
}

/** Validate the PR checks. Throws an Error with `__exit__:N` to signal the desired exit code. */
function validate(body, files) {
  const errors = [];
  if (!body || body.length < MIN_BODY_LENGTH) {
    errors.push(`PR body is too short (${(body || '').length} chars; need ${MIN_BODY_LENGTH}+).`);
  }
  if (files.includes('package.json') && !files.includes('pnpm-lock.yaml')) {
    errors.push('package.json was modified but pnpm-lock.yaml was not.');
  }
  return errors;
}

function runChecks() {
  const body = process.env.PR_BODY || '';
  const baseRef = process.env.PR_BASE_REF || DEFAULT_BASE_REF;
  const files = getChangedFiles(baseRef);
  const errors = validate(body, files);

  if (errors.length === 0) {
    console.log(
      `[pr-checks] OK (body=${body.length} chars, files=${files.length}, base=${baseRef})`
    );
    return;
  }

  console.error('[pr-checks] FAILURES:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

// CLI entry — run runChecks() when invoked directly.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]);
if (isDirectInvocation) runChecks();

// Named exports for tests.
export { validate, getChangedFiles, runChecks, MIN_BODY_LENGTH, DEFAULT_BASE_REF };
