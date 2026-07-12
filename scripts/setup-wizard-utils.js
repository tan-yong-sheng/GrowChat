#!/usr/bin/env node
/**
 * GrowChat Setup Wizard — shared utilities.
 *
 * Provides prompts, command runners, secret helpers, and output parsers
 * used by both setup-wizard.js (the main orchestrator) and
 * setup-wizard-steps.js (the wizard steps).
 *
 * The shared `rl` readline interface is created via createRl() and
 * stored at module scope; prompt(), secretPrompt(), and confirm() all
 * read from it.
 */
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..');

let rl;

export function createRl() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

export function setRl(value) {
  rl = value;
}

function getRl() {
  if (!rl) throw new Error('rl not initialized: call setRl(createRl()) first');
  return rl;
}

/**
 * Prompt the user for input with an optional default.
 * Returns trimmed input or the default if empty.
 */
export async function prompt(label, { default: def } = {}) {
  const suffix = def != null && def !== '' ? ` (${def})` : '';
  const answer = await getRl().question(`${label}${suffix}: `);
  const trimmed = answer.trim();
  return trimmed !== '' ? trimmed : (def ?? '');
}

/**
 * Prompt for a secret value without echoing it to the terminal.
 * Uses a no-echo input mode so the secret doesn't appear in
 * terminal scrollback or screen recordings.
 */
export async function secretPrompt(label) {
  console.log(`${label}: `);
  const secretRl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...args) => {
    if (typeof chunk === 'string' && chunk !== '\n' && chunk !== '\r\n') {
      return origWrite('*', ...args);
    }
    return origWrite(chunk, ...args);
  };
  try {
    const answer = await secretRl.question('');
    return answer.trim();
  } finally {
    process.stdout.write = origWrite;
    secretRl.close();
  }
}

/**
 * Prompt a yes/no question. Defaults to "yes" unless def is false.
 */
export async function confirm(label, { default: def = true } = {}) {
  const hint = def ? 'Y/n' : 'y/N';
  const answer = await getRl().question(`${label} [${hint}]: `);
  const val = answer.trim().toLowerCase();
  if (val === '') return def;
  return val === 'y' || val === 'yes';
}

/**
 * Run a command via spawnSync.
 * When captureOutput is false (default), inherits stdio for live output.
 * When captureOutput is true, captures stdout/stderr for programmatic parsing.
 * Returns { ok, status, stdout, stderr }.
 */
export function logStart(cmd, args, stepLabel) {
  const display = `${cmd} ${args.join(' ')}`;
  if (stepLabel) console.log(`\n\u23f3 ${stepLabel}...`);
  else console.log(` \u2192 ${display}`);
  return display;
}

function logFailure(display, stderr, captureOutput) {
  console.error(`\n\u274c Command failed: ${display}`);
  if (captureOutput && stderr) console.error(stderr);
  console.error('   Fix the issue above and re-run the wizard.');
}

export function run(
  cmd,
  args,
  { exitOnError = true, label: stepLabel, captureOutput = false } = {}
) {
  const display = logStart(cmd, args, stepLabel);
  const result = spawnCommand(cmd, args, captureOutput);
  return finalizeResult(result, { exitOnError, display, captureOutput });
}

function spawnCommand(cmd, args, captureOutput) {
  const stdioConfig = captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit';
  return spawnSync(cmd, args, {
    stdio: stdioConfig,
    shell: true,
    cwd: ROOT,
  });
}

function finalizeResult(result, { exitOnError, display, captureOutput }) {
  const ok = result.status === 0;
  const output = captureResultOutput(result);
  if (exitOnFailure(result, ok, exitOnError, display, output.stderr, captureOutput)) {
    return undefined;
  }
  return { ok, status: result.status ?? 1, stdout: output.stdout, stderr: output.stderr };
}

function exitOnFailure(result, ok, exitOnError, display, stderr, captureOutput) {
  if (ok || !exitOnError) return false;
  logFailure(display, stderr, captureOutput);
  process.exit(result.status ?? 1);
  return true;
}

function captureResultOutput(result) {
  return {
    stdout: (result.stdout ?? '').toString(),
    stderr: (result.stderr ?? '').toString(),
  };
}

/**
 * Set a Cloudflare secret via `wrangler secret put`.
 * Pipes the value into stdin so it never appears in shell history.
 */
export function setSecret(name, value) {
  console.log(` \u2192 Setting secret ${name}...`);
  const result = spawnSync('pnpm', ['exec', 'wrangler', 'secret', 'put', name], {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: true,
    cwd: ROOT,
  });
  if (result.status !== 0) {
    console.error(`\n\u274c Failed to set secret ${name}`);
    process.exit(result.status ?? 1);
  }
}

/**
 * Generate a cryptographically random hex string (for JWT_SECRET default).
 */
export function generateSecret(length = 32) {
  return randomBytes(length).toString('hex');
}

/**
 * Parse a D1 database_id from wrangler create output.
 * Supports both:
 *   "database_id" = "<uuid>"
 *   "database_id": "<uuid>"
 * Returns the matched ID or null.
 */
export function parseD1DatabaseId(stdout) {
  const match =
    stdout.match(/database_id\s*=\s*([a-f0-9-]+)/i) ||
    stdout.match(/"database_id"\s*:\s*"([a-f0-9-]+)"/i);
  return match ? match[1] : null;
}

/**
 * Parse a KV namespace ID from wrangler create output.
 * Supports:
 *   id = <32-hex>
 *   "id": "<32-hex>"
 * Returns the matched ID or null.
 */
export function parseKvNamespaceId(stdout) {
  const match =
    stdout.match(/id\s*=\s*([a-f0-9]{32})/i) || stdout.match(/"id"\s*:\s*"([a-f0-9]{32})"/i);
  return match ? match[1] : null;
}

/**
 * Prompt the user to enter a custom secret value (no-echo), then set it.
 * Returns true if the secret was set, false if skipped or aborted.
 */
export async function handleCustomSecret(name) {
  const value = await secretPrompt(`Enter your own ${name}`);
  if (value) {
    setSecret(name, value);
    console.log(` \u2705 ${name} set.\n`);
    return true;
  }
  return false;
}

/**
 * Handle setting a secret from an environment variable.
 * Prompts the user to confirm using the env value, then sets it.
 * Returns true if the secret was set from env, false if user chose to enter a custom value.
 */
export async function handleEnvSecret(name, envValue) {
  const useEnv = await confirm(`Use ${name} from environment variable?`);
  if (useEnv) {
    setSecret(name, envValue);
    console.log(` \u2705 ${name} set.\n`);
    return true;
  }
  return false;
}
