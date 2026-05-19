#!/usr/bin/env node

/**
 * GrowChat Setup Wizard
 *
 * Interactive CLI that takes a new user from zero to a deployed GrowChat
 * instance. Creates all required Cloudflare resources, sets secrets, applies
 * migrations, and deploys.
 *
 * Usage:
 *   pnpm run setup
 *   node scripts/setup-wizard.js
 */

import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Helpers ────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let rl;

function createRl() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt the user for input with an optional default.
 * Returns trimmed input or the default if empty.
 */
async function prompt(label, { default: def } = {}) {
  const suffix = def != null && def !== '' ? ` (${def})` : '';
  const answer = await rl.question(`${label}${suffix}: `);
  const trimmed = answer.trim();
  return trimmed !== '' ? trimmed : (def ?? '');
}

/**
 * Prompt a yes/no question. Defaults to "yes" unless def is false.
 */
async function confirm(label, { default: def = true } = {}) {
  const hint = def ? 'Y/n' : 'y/N';
  const answer = await rl.question(`${label} [${hint}]: `);
  const val = answer.trim().toLowerCase();
  if (val === '') return def;
  return val === 'y' || val === 'yes';
}

/**
 * Run a command via spawnSync, inheriting stdio.
 * Returns { ok, status }.
 */
function run(cmd, args, { exitOnError = true, label: stepLabel } = {}) {
  const display = `${cmd} ${args.join(' ')}`;
  if (stepLabel) console.log(`\n⏳ ${stepLabel}...`);
  else console.log(`  → ${display}`);

  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    cwd: ROOT,
  });

  const ok = result.status === 0;
  if (!ok && exitOnError) {
    console.error(`\n❌ Command failed: ${display}`);
    console.error('   Fix the issue above and re-run the wizard.');
    process.exit(result.status ?? 1);
  }
  return { ok, status: result.status ?? 1 };
}

/**
 * Set a Cloudflare secret via `wrangler secret put`.
 * Pipes the value into stdin so it never appears in shell history.
 */
function setSecret(name, value) {
  console.log(`  → Setting secret ${name}...`);
  const result = spawnSync('pnpm', ['exec', 'wrangler', 'secret', 'put', name], {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: true,
    cwd: ROOT,
  });

  if (result.status !== 0) {
    console.error(`\n❌ Failed to set secret ${name}`);
    process.exit(result.status ?? 1);
  }
}

/**
 * Generate a cryptographically random hex string (for JWT_SECRET default).
 */
function generateSecret(length = 32) {
  return randomBytes(length).toString('hex');
}

// ── Wizard Steps ───────────────────────────────────────────────────────────

async function stepWelcome() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║          🌱  GrowChat Setup Wizard                   ║
║                                                      ║
║  This wizard will set up everything you need to      ║
║  deploy GrowChat to Cloudflare Workers.              ║
║                                                      ║
║  It will:                                           ║
║    1. Create D1 database, R2 bucket, KV namespaces   ║
║    2. Apply database migrations                      ║
║    3. Set your secrets (JWT, API keys)               ║
║    4. Deploy to Cloudflare                           ║
║                                                      ║
║  Press Ctrl+C at any time to abort.                  ║
╚══════════════════════════════════════════════════════╝
`);
  await confirm('Ready to begin?', { default: true });
}

/**
 * Step 1: Create Cloudflare resources.
 * Checks for existing resources before creating.
 */
async function stepCreateResources() {
  console.log('\n📡  Step 1: Creating Cloudflare resources\n');
  console.log("   We'll create the D1 database, R2 bucket, and KV namespaces");
  console.log("   needed by GrowChat. If a resource already exists, we'll skip it.\n");

  // ── D1 Database ─────────────────────────────────────────────────────────
  const dbResult = run('pnpm', ['exec', 'wrangler', 'd1', 'create', 'growchat'], {
    exitOnError: false,
    label: 'Creating D1 database "growchat"',
  });

  if (dbResult.ok) {
    console.log('\n⚠️  IMPORTANT: Copy the database_id from the output above');
    console.log('   and update wrangler.jsonc → d1_databases[0].database_id\n');
    const updated = await confirm('Have you updated wrangler.jsonc with the database ID?');
    if (!updated) {
      console.log(
        "   You'll need to update it before migrations can run. Re-run the wizard after."
      );
      process.exit(1);
    }
  } else {
    console.log('   D1 database "growchat" already exists — skipping.');
  }

  // ── R2 Bucket ───────────────────────────────────────────────────────────
  const r2Result = run('pnpm', ['exec', 'wrangler', 'r2', 'bucket', 'create', 'growchat-files'], {
    exitOnError: false,
    label: 'Creating R2 bucket "growchat-files"',
  });

  if (!r2Result.ok) {
    console.log('   R2 bucket "growchat-files" already exists — skipping.');
  }

  // ── KV Namespaces ───────────────────────────────────────────────────────
  const kvNamespaces = ['CHAT_SESSIONS', 'SESSIONS', 'CACHE'];
  const kvIds = {};

  for (const ns of kvNamespaces) {
    const kvResult = run('pnpm', ['exec', 'wrangler', 'kv', 'namespace', 'create', ns], {
      exitOnError: false,
      label: `Creating KV namespace "${ns}"`,
    });

    if (kvResult.ok) {
      console.log(`\n⚠️  Copy the id for "${ns}" from the output above`);
      console.log('   and update the corresponding entry in wrangler.jsonc.\n');
      const kvId = await prompt(`Enter the KV namespace ID for ${ns}`);
      if (kvId) kvIds[ns] = kvId;
    } else {
      console.log(`   KV namespace "${ns}" already exists — skipping.`);
    }
  }

  // If we got KV IDs, offer to update wrangler.jsonc automatically
  if (Object.keys(kvIds).length > 0) {
    const autoUpdate = await confirm('Auto-update wrangler.jsonc with the KV namespace IDs above?');
    if (autoUpdate) {
      updateWranglerKvIds(kvIds);
    }
  }

  console.log('\n✅ Cloudflare resources ready.');
}

/**
 * Update wrangler.jsonc KV namespace IDs in-place.
 */
function updateWranglerKvIds(ids) {
  const wranglerPath = resolve(ROOT, 'wrangler.jsonc');

  // Strip JSONC comments by reading as text and doing targeted replacements
  let content = readFileSync(wranglerPath, 'utf-8');

  // Map of binding name → new id
  for (const [binding, id] of Object.entries(ids)) {
    // Find the KV namespace block with this binding and replace its id
    // Pattern: { "binding": "SESSIONS", "id": "..." }
    const bindingRegex = new RegExp(
      `(\\{[^{}]*"binding"\\s*:\\s*"${binding}"[^{}]*"id"\\s*:\\s*")([^"]*)(")`,
      'g'
    );
    content = content.replace(bindingRegex, `$1${id}$3`);

    // Also update preview_id if present
    const previewRegex = new RegExp(
      `(\\{[^{}]*"binding"\\s*:\\s*"${binding}"[^{}]*"preview_id"\\s*:\\s*")([^"]*)(")`,
      'g'
    );
    content = content.replace(previewRegex, `$1${id}$3`);
  }

  writeFileSync(wranglerPath, content);
  console.log('   ✏️  wrangler.jsonc updated with KV namespace IDs.');
}

/**
 * Step 2: Apply D1 migrations.
 */
async function stepApplyMigrations() {
  console.log('\n🗄️  Step 2: Applying D1 migrations\n');

  const migrationsDir = resolve(ROOT, 'migrations');
  if (!existsSync(migrationsDir)) {
    console.error('   ❌ No migrations/ directory found. Cannot apply migrations.');
    process.exit(1);
  }

  run('pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'growchat', '--remote'], {
    label: 'Applying D1 migrations (remote)',
  });

  console.log('\n✅ D1 migrations applied.');
}

/**
 * Step 3: Set secrets.
 */
async function stepSetSecrets() {
  console.log('\n🔐  Step 3: Setting secrets\n');
  console.log('   Secrets are stored securely in Cloudflare — never written to files.\n');

  // ── JWT_SECRET ──────────────────────────────────────────────────────────
  const defaultJwt = generateSecret();
  console.log('   JWT_SECRET is used to sign authentication tokens.');
  console.log('   A random one has been generated for you — press Enter to use it.\n');
  const jwtSecret = await prompt('JWT_SECRET', { default: defaultJwt });
  setSecret('JWT_SECRET', jwtSecret);
  console.log('   ✅ JWT_SECRET set.\n');

  // ── RESEND_API_KEY (optional) ───────────────────────────────────────────
  console.log('   RESEND_API_KEY is used for transactional emails (password reset).');
  console.log('   This is optional — you can set it later via:');
  console.log('     pnpm exec wrangler secret put RESEND_API_KEY\n');
  const hasResend = await confirm('Do you have a Resend API key?');
  if (hasResend) {
    const resendKey = await prompt('RESEND_API_KEY');
    if (resendKey) {
      setSecret('RESEND_API_KEY', resendKey);
      console.log('   ✅ RESEND_API_KEY set.\n');
    }
  } else {
    console.log('   ⏭️  Skipped RESEND_API_KEY — emails will not work until this is set.\n');
  }

  // ── RESEND_FROM_EMAIL (optional, only if Resend key set) ────────────────
  if (hasResend) {
    const resendFrom = await prompt('RESEND_FROM_EMAIL', { default: 'onboarding@resend.dev' });
    if (resendFrom) {
      setSecret('RESEND_FROM_EMAIL', resendFrom);
      console.log('   ✅ RESEND_FROM_EMAIL set.\n');
    }
  }

  console.log('✅ Secrets configured.');
}

/**
 * Step 4: Create admin account.
 */
async function stepCreateAdmin() {
  console.log('\n👤  Step 4: Create admin account\n');
  console.log('   After deployment, register your admin account at the app URL.');
  console.log('   Then promote the account to admin via the D1 console:\n');
  console.log('     pnpm exec wrangler d1 execute growchat --remote \\');
  console.log("       --command=\"UPDATE users SET role='admin' WHERE email='YOUR_EMAIL'\"\n");

  await confirm("Understood — I'll promote my account after first login?");
}

/**
 * Step 5: Deploy.
 */
async function stepDeploy() {
  console.log('\n🚀  Step 5: Deploying to Cloudflare Workers\n');

  // Build CSS first
  run('pnpm', ['run', 'build:css'], { label: 'Building CSS' });

  // Deploy
  run('pnpm', ['exec', 'wrangler', 'deploy'], { label: 'Deploying to Cloudflare' });

  console.log('\n✅ Deployment complete!');
}

async function stepSummary() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║          🎉  GrowChat is live!                       ║
║                                                      ║
║  Next steps:                                        ║
║    1. Open your Workers URL (shown above)            ║
║    2. Register your admin account                    ║
║    3. Promote to admin via D1 console                ║
║    4. Add an LLM connection in Settings              ║
║                                                      ║
║  Useful commands:                                   ║
║    pnpm run dev          — Local development         ║
║    pnpm run deploy       — Re-deploy after changes   ║
║    pnpm exec wrangler    — Run any wrangler command   ║
║                                                      ║
║  Docs: docs/index.md                                ║
║  Issues: github.com/tan-yong-sheng/GrowChat/issues  ║
╚══════════════════════════════════════════════════════╝
`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.clear();

  rl = createRl();

  try {
    await stepWelcome();
    await stepCreateResources();
    await stepApplyMigrations();
    await stepSetSecrets();
    await stepCreateAdmin();
    await stepDeploy();
    await stepSummary();
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'ERR_USE_AFTER_CLOSE') {
      // User pressed Ctrl+C
      console.log('\n\n👋  Wizard aborted. Re-run with: pnpm run setup');
      process.exit(0);
    }
    throw err;
  } finally {
    rl.close();
  }
}

main();
