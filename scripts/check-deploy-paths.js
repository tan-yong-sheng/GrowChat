#!/usr/bin/env node
/**
 * Check whether deploy-relevant paths changed since the last commit
 * (or since main, if run in CI).
 *
 * Replicates the dorny/paths-filter logic from .github/workflows/deploy.yml
 * locally: only src/, migrations/, wrangler.jsonc, and package.json
 * trigger a deploy. Pure doc changes (docs/, README.md, AGENTS.md) skip.
 *
 * Usage:
 *   node scripts/check-deploy-paths.js          # check against HEAD~1 (last commit)
 *   node scripts/check-deploy-paths.js main    # check against origin/main
 *
 * Exit code 0 = deploy needed, 1 = no deploy needed.
 */
// Import kept for future use (readFileSync not needed yet)
// eslint-disable-next-line no-unused-vars
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DEPLOY_PATHS = ['src/', 'migrations/', 'wrangler.jsonc', 'package.json'];

const SKIP_PATTERNS = [
  /\/docs\//,
  /^README\.md$/,
  /^AGENTS\.md$/,
  /^\.(github|editorconfig|gitignore|prettierrc|secrets)/,
  /\.md$/,
  /\.yml$/,
  /\.yaml$/,
];

const ref = process.argv[2] ?? 'HEAD~1';

try {
  const diffOutput = execSync(`git diff --name-only ${ref}`, {
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();

  if (!diffOutput) {
    console.log('No changes detected since last commit.');
    process.exit(0);
  }

  const changedFiles = diffOutput.split('\n').filter(Boolean);

  // Check each file against deploy-relevant paths
  const deployRelevant = changedFiles.some((file) =>
    DEPLOY_PATHS.some((prefix) => file.startsWith(prefix) || file === prefix)
  );

  // Check for doc-only exemption
  const isDocOnly = changedFiles.every((file) =>
    SKIP_PATTERNS.some((pattern) => pattern.test(file))
  );

  if (deployRelevant) {
    console.log(`Deploy-relevant changes detected in:`);
    for (const file of changedFiles) {
      if (DEPLOY_PATHS.some((p) => file.startsWith(p) || file === p)) {
        console.log(`  - ${file}`);
      }
    }
    process.exit(0);
  }

  if (isDocOnly) {
    console.log('Only doc/safe files changed — skipping deploy.');
    console.log('Changed files:');
    for (const file of changedFiles) {
      console.log(`  - ${file}`);
    }
    process.exit(1);
  }

  // Mixed changes — treat as deploy-relevant
  console.log('Mixed changes (deploy-relevant + doc-only) — deploy needed.');
  process.exit(0);
} catch (err) {
  console.error('Failed to check deploy paths:', err.message);
  process.exit(2);
}
