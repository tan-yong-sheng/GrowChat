#!/usr/bin/env node
/**
 * Wrapper around `fallow flags` that exits 1 when any flags are found.
 * The `flags` subcommand does not support `--fail-on-issues`, so this script
 * parses the JSON output and enforces the gate.
 */
import { spawn } from 'node:child_process';
import { collectOutput } from './lib/fallow-gate.js';

const args = process.argv.slice(2);
const child = spawn('fallow', ['flags', '--format', 'json', ...args], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

const output = collectOutput(child);

function exitWithChildError(code) {
  process.stderr.write(output.stderr);
  process.exit(code ?? 1);
}

function getFlagTotal(parsed) {
  return parsed?.summary?.total;
}

function getFlagFindingsCount(parsed) {
  return parsed?.findings?.length;
}

function getFlagCount() {
  const parsed = JSON.parse(output.stdout);
  return getFlagTotal(parsed) ?? getFlagFindingsCount(parsed) ?? 0;
}

function exitWithFlagsFound() {
  process.stdout.write(output.stdout);
  process.exit(1);
}

function exitClean() {
  process.stdout.write(output.stdout);
  process.exit(0);
}

function handleChildClose(code) {
  if (code !== 0) {
    exitWithChildError(code);
  }

  try {
    if (getFlagCount() > 0) {
      exitWithFlagsFound();
    }
    exitClean();
  } catch {
    exitClean();
  }
}

child.on('close', (code) => handleChildClose(code));
