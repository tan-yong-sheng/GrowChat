#!/usr/bin/env node
/**
 * Seed a test user using TEST_EMAIL / TEST_PASSWORD from .dev.vars.
 * Registers the user via the API.
 *
 * Usage:
 *   node scripts/seed-test-user.js    # reads from .dev.vars
 *   node scripts/seed-test-user.js    # env vars override .dev.vars
 *
 * Requires a running server.
 */

import { readFileSync } from 'node:fs';

// Load .dev.vars into process.env (same pattern as test-e2e.js)
try {
  const content = readFileSync('.dev.vars', 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (match && !process.env[match[1]]) {
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  }
} catch {
  /* .dev.vars is optional */
}

const BASE_URL = process.env.TEST_URL || process.env.APP_URL || 'http://localhost:8787';

const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;

if (!email || !password) {
  console.error('TEST_EMAIL and TEST_PASSWORD must be set (in .dev.vars or env)');
  process.exit(1);
}

async function seed() {
  console.error('Seeding test user...');

  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'E2E Test User' }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 409) {
      console.error('Test user already exists');
    } else {
      console.error(`Failed to seed (${res.status}): ${text}`);
      process.exit(1);
    }
  } else {
    console.error('Seeded test user');
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
