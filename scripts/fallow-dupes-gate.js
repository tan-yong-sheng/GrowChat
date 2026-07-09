#!/usr/bin/env node
/**
 * Wrapper around `fallow dupes` that enforces a duplication threshold via exit code.
 *
 * `fallow dupes --fail-on-issues` is silently ignored in v2.104.0 — the subcommand
 * always exits 0 regardless of the duplication percentage. This script parses the
 * JSON output and exits 1 when duplication exceeds the configured threshold.
 *
 * Usage:
 *   node scripts/fallow-dupes-gate.js [threshold]
 *
 *   threshold  Duplication percentage to fail on (default: 0.1, i.e. 0.1%)
 *
 * Passes through additional arguments to `fallow dupes` (e.g., --changed-since HEAD).
 * The last CLI argument before fallow's own flags is consumed as the threshold.
 */
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);

// Consume the last numeric argument as threshold; everything before it is a fallow flag.
let threshold = 0.1;
const fallowArgs = [];
for (const arg of args) {
  const num = Number(arg);
  if (!Number.isNaN(num) && arg === String(num)) {
    threshold = num;
  } else {
    fallowArgs.push(arg);
  }
}

const child = spawn('fallow', ['dupes', '--format', 'json', '--quiet', ...fallowArgs], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (chunk) => {
  stdout += chunk;
});

child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

// fallow-ignore-next-line complexity
function handleChildClose(code) {
  if (code !== 0 && code !== null) {
    process.stderr.write(`fallow exited ${code}: ${stderr}`);
    process.exit(code);
  }

  try {
    const parsed = JSON.parse(stdout);
    const pct = parsed.stats.duplication_percentage;

    if (pct > threshold && threshold > 0) {
      process.stderr.write(`\n❌ Duplication ${pct.toFixed(2)}% exceeds threshold ${threshold}%\n`);
      process.exit(1);
    }

    process.stderr.write(`\n✓ Duplication ${pct.toFixed(2)}% within threshold ${threshold}%\n`);
    process.stdout.write(stdout);
    process.exit(0);
  } catch {
    // fallow exited 0 but produced no JSON (unlikely); pass through
    process.stderr.write(`\n! Failed to parse fallow output\n`);
    process.exit(1);
  }
}

child.on('close', (code) => handleChildClose(code));
