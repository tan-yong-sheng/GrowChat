#!/usr/bin/env node
/**
 * Ensures `.dev.vars` exists and contains a usable `JWT_SECRET` for local dev.
 *
 * - If `.dev.vars` is missing, it is created from `template/.dev.vars.example`.
 * - If `JWT_SECRET` is missing, empty, or still the template placeholder, a
 *   cryptographically random value is generated and written.
 * - Existing user-provided secrets are never overwritten.
 *
 * This helper is intentionally a convenience, not a gate: it always exits 0.
 */

import { access, constants, copyFile, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const DEV_VARS_PATH = resolve(ROOT, '.dev.vars');
const TEMPLATE_PATH = resolve(ROOT, 'template/.dev.vars.example');
const TEMPLATE_PLACEHOLDER = 'change-me-to-a-random-string';
const SECRET_BYTES = 32;

function generateSecret() {
  return randomBytes(SECRET_BYTES).toString('hex');
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadDevVarsContent() {
  if (await pathExists(DEV_VARS_PATH)) {
    return readFile(DEV_VARS_PATH, 'utf8');
  }
  if (await pathExists(TEMPLATE_PATH)) {
    await copyFile(TEMPLATE_PATH, DEV_VARS_PATH);
    console.log('Created .dev.vars from template/.dev.vars.example.');
    return readFile(DEV_VARS_PATH, 'utf8');
  }
  return '';
}

async function replaceSecretLine(content, generated, match) {
  const lineStart = content.lastIndexOf('\n', match.index) + 1;
  const lineEnd = content.indexOf('\n', match.index);
  const end = lineEnd === -1 ? content.length : lineEnd;
  const updated = content.slice(0, lineStart) + `JWT_SECRET=${generated}` + content.slice(end);
  await writeFile(DEV_VARS_PATH, updated);
}

async function appendSecretLine(content, generated) {
  const needsSeparator = content.length > 0 && !content.endsWith('\n');
  const separator = needsSeparator ? '\n' : '';
  await writeFile(DEV_VARS_PATH, `${separator}JWT_SECRET=${generated}\n`, {
    flag: 'a',
  });
}

async function writeGeneratedSecret(content, generated, match) {
  if (match) {
    await replaceSecretLine(content, generated, match);
  } else {
    await appendSecretLine(content, generated);
  }
  console.log('Generated JWT_SECRET in .dev.vars.');
}

async function ensureDevVars() {
  const content = await loadDevVarsContent();
  const match = content.match(/^(JWT_SECRET\s*=\s*)(.*?)\s*$/m);
  const currentValue = match ? match[2] : undefined;

  if (currentValue && currentValue !== TEMPLATE_PLACEHOLDER) {
    console.log('JWT_SECRET is already set in .dev.vars.');
    return;
  }

  await writeGeneratedSecret(content, generateSecret(), match);
}

ensureDevVars().catch((err) => {
  console.error('ensure-dev-vars:', err.message);
  process.exit(0);
});
