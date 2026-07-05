#!/usr/bin/env node
/**
 * Wrapper around `fallow flags` that exits 1 when any flags are found.
 * The `flags` subcommand does not support `--fail-on-issues`, so this script
 * parses the JSON output and enforces the gate.
 */
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const child = spawn('fallow', ['flags', '--format', 'json', ...args], {
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
function handleChildClose(code, stdout, stderr) {
  if (code !== 0) {
    process.stderr.write(stderr);
    process.exit(code ?? 1);
  }

  try {
    const parsed = JSON.parse(stdout);
    const total = parsed?.summary?.total ?? parsed?.findings?.length ?? 0;
    if (total > 0) {
      process.stdout.write(stdout);
      process.exit(1);
    }
    process.stdout.write(stdout);
    process.exit(0);
  } catch {
    process.stdout.write(stdout);
    process.exit(0);
  }
}

child.on('close', (code) => handleChildClose(code, stdout, stderr));
