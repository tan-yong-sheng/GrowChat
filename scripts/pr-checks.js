#!/usr/bin/env node
/**
 * Lightweight offline PR semantic checks.
 *
 * Replaces `danger ci` after the latter consistently failed on large PRs
 * with `ERR_STREAM_PREMATURE_CLOSE` (node-fetch v2 + gzipped GitHub API
 * responses — see commits 79302233 and 6b795700 for context).
 *
 * The original dangerfile.js only enforced two rules, both as `warn()`
 * (non-blocking). This script preserves that semantics: it reports
 * findings to stderr but always exits 0 unless git diff itself fails.
 * Why? Because:
 *   - PR body length is informational; the contributor can amend it later.
 *   - package.json changes that don't touch dependencies (e.g. adding
 *     `--max-warnings 0` to a lint-staged command) legitimately leave
 *     pnpm-lock.yaml unchanged — flagging them as a hard failure
 *     false-positives on every config-only package.json edit.
 *
 * Inputs:
 *   - PR_BODY env var: the raw PR body text (set by the workflow from
 *     github.event.pull_request.body).
 *   - PR_BASE_REF env var: the base ref to diff against (default: origin/main).
 *
 * Exit codes:
 *   0 — git diff succeeded (warnings may still have been printed)
 *   1 — git diff itself failed (this is a hard error)
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

/** Validate the PR checks. Returns a list of human-readable findings (warnings, never errors). */
function validate(body, files) {
  const warnings = [];
  if (!body || body.length < MIN_BODY_LENGTH) {
    warnings.push(`PR body is too short (${(body || '').length} chars; need ${MIN_BODY_LENGTH}+).`);
  }
  if (files.includes('package.json') && !files.includes('pnpm-lock.yaml')) {
    warnings.push('package.json was modified but pnpm-lock.yaml was not.');
  }
  return warnings;
}

function runChecks() {
  const body = process.env.PR_BODY || '';
  const baseRef = process.env.PR_BASE_REF || DEFAULT_BASE_REF;
  const files = getChangedFiles(baseRef);
  const warnings = validate(body, files);

  if (warnings.length === 0) {
    console.log(
      `[pr-checks] OK (body=${body.length} chars, files=${files.length}, base=${baseRef})`
    );
    return;
  }

  console.warn('[pr-checks] WARNINGS (non-blocking):');
  for (const w of warnings) console.warn(`  - ${w}`);
  console.log(`[pr-checks] OK with warnings (body=${body.length} chars, base=${baseRef})`);
}

// CLI entry — run runChecks() when invoked directly.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]);
if (isDirectInvocation) runChecks();

// Named exports for tests.
export { validate, getChangedFiles, runChecks, MIN_BODY_LENGTH, DEFAULT_BASE_REF };
