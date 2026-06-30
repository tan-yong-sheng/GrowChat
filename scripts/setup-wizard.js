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
 * Prompt for a secret value without echoing it to the terminal.
 * Uses a no-echo input mode so the secret doesn't appear in
 * terminal scrollback or screen recordings.
 *
 * Implementation: temporarily replaces process.stdout.write to mask
 * non-newline output with '*'. A try/finally guarantees stdout is
 * restored even if the underlying readline rejects.
 */
async function secretPrompt(label) {
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
async function confirm(label, { default: def = true } = {}) {
  const hint = def ? 'Y/n' : 'y/N';
  const answer = await rl.question(`${label} [${hint}]: `);
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
function run(cmd, args, { exitOnError = true, label: stepLabel, captureOutput = false } = {}) {
  const display = `${cmd} ${args.join(' ')}`;
  if (stepLabel) console.log(`\n⏳ ${stepLabel}...`);
  else console.log(` → ${display}`);

  const stdioConfig = captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit';
  const result = spawnSync(cmd, args, {
    stdio: stdioConfig,
    shell: true,
    cwd: ROOT,
  });

  const ok = result.status === 0;
  const stdout = (result.stdout ?? '').toString();
  const stderr = (result.stderr ?? '').toString();

  if (!ok && exitOnError) {
    console.error(`\n❌ Command failed: ${display}`);
    if (captureOutput && stderr) console.error(stderr);
    console.error('   Fix the issue above and re-run the wizard.');
    process.exit(result.status ?? 1);
  }
  return { ok, status: result.status ?? 1, stdout, stderr };
}

/**
 * Check if a wrangler command output indicates the resource already exists.
 * Looks for common "already exists" patterns in stdout and stderr.
 */
function isAlreadyExists(stdout, stderr) {
  const combined = `${stdout} ${stderr}`.toLowerCase();
  return (
    combined.includes('already exists') ||
    combined.includes('already been created') ||
    combined.includes('name is already taken')
  );
}

/**
 * Set a Cloudflare secret via `wrangler secret put`.
 * Pipes the value into stdin so it never appears in shell history.
 */
function setSecret(name, value) {
  console.log(` → Setting secret ${name}...`);
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
  ║ 🌱 GrowChat Setup Wizard                            ║
  ║                                                      ║
  ║ This wizard will set up everything you need to       ║
  ║ deploy GrowChat to Cloudflare Workers.               ║
  ║                                                      ║
  ║ It will:                                             ║
  ║   1. Create D1 database, R2 bucket, KV namespaces   ║
  ║   2. Apply database migrations                       ║
  ║   3. Set your secrets (JWT, API keys)                ║
  ║   4. Configure ALLOWED_ORIGINS for CORS              ║
  ║   5. Deploy to Cloudflare                            ║
 ║                                                     ║
 ║ Tip: Set env vars JWT_SECRET, RESEND_API_KEY,      ║
 ║      RESEND_FROM_EMAIL to skip interactive prompts  ║
  ║                                                      ║
  ║ Press Ctrl+C at any time to abort.                   ║
  ╚══════════════════════════════════════════════════════╝
  `);
  const ready = await confirm('Ready to begin?', { default: true });
  if (!ready) {
    console.log('\n👋 Wizard cancelled. Re-run with: pnpm run setup');
    process.exit(0);
  }
}

/**
 * Handle a failed resource creation command.
 * If the output indicates the resource already exists, logs a skip message.
 * Otherwise, displays the error and asks whether to continue.
 */
async function handleCreateError(result, resourceLabel) {
  if (isAlreadyExists(result.stdout, result.stderr)) {
    console.log(` ${resourceLabel} already exists — skipping.`);
  } else {
    console.error(`\n❌ ${resourceLabel} creation failed with an unexpected error:`);
    console.error(result.stderr || result.stdout);
    const continueAnyway = await confirm('Skip and continue anyway?', {
      default: false,
    });
    if (!continueAnyway) process.exit(1);
  }
}

/**
 * Step 1: Create Cloudflare resources.
 * Checks for existing resources before creating.
 * Distinguishes "already exists" from real errors.
 */
async function stepCreateResources() {
  console.log('\n📡 Step 1: Creating Cloudflare resources\n');
  console.log(" We'll create the D1 database, R2 bucket, and KV namespaces");
  console.log(" needed by GrowChat. If a resource already exists, we'll skip it.\n");

  // ── D1 Database ─────────────────────────────────────────────────────────
  const dbResult = run('pnpm', ['exec', 'wrangler', 'd1', 'create', 'growchat'], {
    exitOnError: false,
    label: 'Creating D1 database "growchat"',
    captureOutput: true,
  });

  if (dbResult.ok) {
    // Parse database_id from wrangler output
    const dbIdMatch =
      dbResult.stdout.match(/database_id\s*=\s*([a-f0-9-]+)/i) ||
      dbResult.stdout.match(/"database_id"\s*:\s*"([a-f0-9-]+)"/i);
    if (dbIdMatch) {
      const dbId = dbIdMatch[1];
      console.log(`  Found database_id: ${dbId.substring(0, 8)}...`);
      const autoUpdate = await confirm('Auto-update wrangler.jsonc with this D1 database ID?');
      if (autoUpdate) {
        updateWranglerD1Id(dbId);
      }
    } else {
      console.log('  ⚠️ Could not parse database_id from output.');
      const dbId = await prompt('Enter the D1 database ID');
      if (dbId) {
        updateWranglerD1Id(dbId);
      }
    }
  } else {
    await handleCreateError(dbResult, 'D1 database "growchat"');
  }

  // ── R2 Bucket ───────────────────────────────────────────────────────────
  const r2Result = run('pnpm', ['exec', 'wrangler', 'r2', 'bucket', 'create', 'growchat-files'], {
    exitOnError: false,
    label: 'Creating R2 bucket "growchat-files"',
    captureOutput: true,
  });

  if (!r2Result.ok) {
    await handleCreateError(r2Result, 'R2 bucket "growchat-files"');
  }

  // ── KV Namespaces ───────────────────────────────────────────────────────
  const kvNamespaces = ['CHAT_SESSIONS', 'SESSIONS', 'CACHE'];
  const kvIds = {};

  for (const ns of kvNamespaces) {
    const kvResult = run('pnpm', ['exec', 'wrangler', 'kv', 'namespace', 'create', ns], {
      exitOnError: false,
      label: `Creating KV namespace "${ns}"`,
      captureOutput: true,
    });

    if (kvResult.ok) {
      // Parse KV namespace ID from output
      const kvIdMatch =
        kvResult.stdout.match(/id\s*=\s*([a-f0-9]{32})/i) ||
        kvResult.stdout.match(/"id"\s*:\s*"([a-f0-9]{32})"/i);
      if (kvIdMatch) {
        const kvId = kvIdMatch[1];
        console.log(`  Found ID: ${kvId.substring(0, 8)}...`);
        kvIds[ns] = kvId;
      } else {
        const kvId = await prompt(`Enter the KV namespace ID for ${ns}`);
        if (kvId) kvIds[ns] = kvId;
      }
    } else {
      await handleCreateError(kvResult, `KV namespace "${ns}"`);
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
 * Update wrangler.jsonc D1 database ID in-place.
 * Updates both database_id and preview_database_id.
 */
function updateWranglerD1Id(dbId) {
  const wranglerPath = resolve(ROOT, 'wrangler.jsonc');
  let content = readFileSync(wranglerPath, 'utf-8');

  // Replace database_id — order-independent within the d1_databases block
  content = content.replace(/("database_id"\s*:\s*")([^"]*)(")/, `$1${dbId}$3`);
  // Replace preview_database_id
  content = content.replace(/("preview_database_id"\s*:\s*")([^"]*)(")/, `$1${dbId}$3`);

  writeFileSync(wranglerPath, content);
  console.log(' ✏️ wrangler.jsonc updated with D1 database ID.');
}

/**
 * Update wrangler.jsonc KV namespace IDs in-place.
 * Uses a two-step approach: first find the KV block for a binding,
 * then replace id/preview_id within that block. This is order-independent —
 * works whether "binding" comes before or after "id" in the JSON.
 */
function updateWranglerKvIds(ids) {
  const wranglerPath = resolve(ROOT, 'wrangler.jsonc');
  let content = readFileSync(wranglerPath, 'utf-8');

  for (const [binding, newId] of Object.entries(ids)) {
    // Find the entire KV namespace object block containing this binding,
    // then replace the "id" and "preview_id" values within that block.
    const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRegex = new RegExp(`\\{[^{}]*"binding"\\s*:\\s*"${escapedBinding}"[^{}]*\\}`, 'g');
    content = content.replace(blockRegex, (match) => {
      let block = match;
      // Replace "id": "..." within this block
      block = block.replace(/("id"\s*:\s*")([^"]*)(")/, `$1${newId}$3`);
      // Replace "preview_id": "..." within this block
      block = block.replace(/("preview_id"\s*:\s*")([^"]*)(")/, `$1${newId}$3`);
      return block;
    });
  }

  writeFileSync(wranglerPath, content);
  console.log(' ✏️ wrangler.jsonc updated with KV namespace IDs.');
}

/**
 * Update wrangler.jsonc ALLOWED_ORIGINS in-place.
 * Takes a string (comma-separated origins) or null to leave unchanged.
 *
 * Rejects the placeholder values shipped in template/wrangler.jsonc so the
 * user can't accidentally deploy with the placeholder intact (which would
 * block all CORS requests at runtime).
 */
function updateWranglerAllowedOrigins(value) {
  if (value == null || value === '') return false;

  const trimmed = String(value).trim();
  if (!trimmed) return false;

  // Refuse to write the placeholder — callers must obtain a real value first.
  const forbidden = ['https://YOUR_WORKERS_URL', 'https://REPLACE_WITH_YOUR_DOMAIN', '*'];
  if (forbidden.includes(trimmed) || /REPLACE_WITH|YOUR_|PLACEHOLDER/i.test(trimmed)) {
    return false;
  }

  const wranglerPath = resolve(ROOT, 'wrangler.jsonc');
  const content = readFileSync(wranglerPath, 'utf-8');

  // Match "ALLOWED_ORIGINS": "..." or without quotes for bare identifiers.
  // Capture leading whitespace so we preserve template formatting.
  // Use the global flag so we update both root vars and env.production.vars overrides.
  const updated = content.replace(
    /("ALLOWED_ORIGINS"\s*:\s*")([^"]*)(")/g,
    (_match, prefix, _old, suffix) => `${prefix}${trimmed}${suffix}`
  );

  if (updated === content) return false;

  writeFileSync(wranglerPath, updated);
  return true;
}

/**
 * Step 2: Apply D1 migrations.
 */
async function stepApplyMigrations() {
  console.log('\n🗄️ Step 2: Applying D1 migrations\n');

  const migrationsDir = resolve(ROOT, 'migrations');
  if (!existsSync(migrationsDir)) {
    console.error(' ❌ No migrations/ directory found. Cannot apply migrations.');
    process.exit(1);
  }

  run('pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'growchat', '--remote'], {
    label: 'Applying D1 migrations (remote)',
  });

  console.log('\n✅ D1 migrations applied.');
}

/**
 * Step 3: Set secrets.
 * Uses no-echo prompts for sensitive values so they don't
 * appear in terminal scrollback.
 *
 * Environment variables are detected and offered as defaults:
 *   JWT_SECRET, RESEND_API_KEY, RESEND_FROM_EMAIL
 * This supports CI/CD and headless workflows where secrets are
 * pre-set in the environment.
 */
async function stepSetSecrets() {
  console.log('\n🔐 Step 3: Setting secrets\n');
  console.log(' Secrets are stored securely in Cloudflare — never written to files.\n');

  // ── JWT_SECRET ──────────────────────────────────────────────────────────
  const envJwt = process.env.JWT_SECRET;
  const defaultJwt = envJwt || generateSecret();

  if (envJwt) {
    console.log(' JWT_SECRET found in environment.');
    const useEnv = await confirm('Use the JWT_SECRET from environment?', {
      default: true,
    });
    if (useEnv) {
      setSecret('JWT_SECRET', envJwt);
      console.log(' ✅ JWT_SECRET set (from environment).\n');
    } else {
      const jwtSecret = await secretPrompt('Enter your own JWT_SECRET');
      setSecret('JWT_SECRET', jwtSecret || defaultJwt);
      console.log(' ✅ JWT_SECRET set.\n');
    }
  } else {
    console.log(' JWT_SECRET is used to sign authentication tokens.');
    console.log(' A random one has been generated for you.');
    const useDefaultJwt = await confirm('Use the generated JWT secret?', {
      default: true,
    });
    let jwtSecret;
    if (useDefaultJwt) {
      jwtSecret = defaultJwt;
    } else {
      jwtSecret = await secretPrompt('Enter your own JWT_SECRET');
    }
    if (!jwtSecret) {
      console.error(
        ' ❌ JWT_SECRET cannot be empty. Please re-run the wizard and provide a value.\n'
      );
      process.exit(1);
    }
    setSecret('JWT_SECRET', jwtSecret);
    console.log(' ✅ JWT_SECRET set.\n');
  }

  // ── RESEND_API_KEY (optional) ───────────────────────────────────────────
  const envResendKey = process.env.RESEND_API_KEY;
  let hasResend = false;

  console.log(' RESEND_API_KEY is used for transactional emails (password reset).');
  console.log(' This is optional — you can set it later via:');
  console.log(' pnpm exec wrangler secret put RESEND_API_KEY\n');

  if (envResendKey) {
    console.log(' RESEND_API_KEY found in environment.');
    const useEnv = await confirm('Use the RESEND_API_KEY from environment?', {
      default: true,
    });
    if (useEnv) {
      setSecret('RESEND_API_KEY', envResendKey);
      console.log(' ✅ RESEND_API_KEY set (from environment).\n');
      hasResend = true;
    }
  }

  if (!hasResend) {
    hasResend = await confirm('Do you have a Resend API key?');
    if (hasResend) {
      const resendKey = await secretPrompt('RESEND_API_KEY');
      if (resendKey) {
        setSecret('RESEND_API_KEY', resendKey);
        console.log(' ✅ RESEND_API_KEY set.\n');
        hasResend = true;
      }
    } else {
      console.log(' ⏭️ Skipped RESEND_API_KEY — emails will not work until this is set.\n');
    }
  }

  // ── RESEND_FROM_EMAIL (optional, only if Resend key set) ────────────────
  if (hasResend) {
    const envResendFrom = process.env.RESEND_FROM_EMAIL;
    const defaultFrom = envResendFrom || 'onboarding@resend.dev';
    const resendFrom = await prompt('RESEND_FROM_EMAIL', {
      default: defaultFrom,
    });
    if (resendFrom) {
      setSecret('RESEND_FROM_EMAIL', resendFrom);
      console.log(' ✅ RESEND_FROM_EMAIL set.\n');
    }
  }

  console.log('✅ Secrets configured.');
}

/**
 * Step 4: Create admin account.
 *
 * Note: Fully automated admin creation would require calling the registration
 * API and then promoting via D1 — both of which need the app to be deployed
 * first. This step therefore provides clear post-deploy instructions.
 */
/**
 * Step 4: Configure ALLOWED_ORIGINS for production.
 *
 * The template ships a non-resolving placeholder so a user can't accidentally
 * deploy with the old `"*"` wildcard (CSRF risk). This step prompts for the
 * real production origin(s) and writes them to wrangler.jsonc so the first
 * deploy already runs with a restrictive CORS policy.
 *
 * Format: comma-separated origins, e.g. "https://chat.example.com,https://staging.example.com"
 */
async function stepConfigureOrigins() {
  console.log('\n🌐 Step 4: Configure ALLOWED_ORIGINS\n');
  console.log(' GrowChat blocks cross-origin requests from origins that aren\u2019t on this list.');
  console.log(' This is a security control against CSRF and unauthorized API access.\n');
  console.log(' Enter one or more origins separated by commas. Examples:');
  console.log('   https://chat.example.com');
  console.log('   https://chat.example.com,https://staging.example.com');
  console.log('   https://<your-subdomain>.workers.dev  (for the default Workers URL)\n');

  let configured = false;
  let attempts = 0;
  const maxAttempts = 3;

  while (!configured && attempts < maxAttempts) {
    attempts += 1;
    const answer = await prompt('ALLOWED_ORIGINS (comma-separated, no quotes)', {
      default: 'https://<your-subdomain>.workers.dev',
    });

    if (!answer || /REPLACE_WITH|YOUR_|PLACEHOLDER|<.*>/i.test(answer)) {
      console.log('  ⚠️ That looks like a placeholder. Enter a real https:// origin.');
      continue;
    }

    // Basic validation: every entry must start with http:// or https://
    const entries = answer
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const invalid = entries.filter((e) => !/^https?:\/\//.test(e));
    if (invalid.length > 0) {
      console.log(
        `  ⚠️ Each origin must start with http:// or https://. Invalid: ${invalid.join(', ')}`
      );
      continue;
    }

    const ok = updateWranglerAllowedOrigins(entries.join(','));
    if (!ok) {
      console.log('  ⚠️ Could not update wrangler.jsonc \u2014 check the file is writable.');
      continue;
    }

    configured = true;
    console.log(`  \u2705 ALLOWED_ORIGINS set to: ${entries.join(', ')}\n`);
  }

  if (!configured) {
    console.error('\n\u274c Failed to configure ALLOWED_ORIGINS after 3 attempts.');
    console.error('   Edit wrangler.jsonc \u2192 vars.ALLOWED_ORIGINS manually before deploying.');
    process.exit(1);
  }
}

async function stepCreateAdmin() {
  console.log('\n👤 Step 4: Create admin account\n');
  console.log(' After deployment, register your admin account at the app URL.');
  console.log(' Then promote the account to admin via the D1 console:\n');
  console.log('   pnpm exec wrangler d1 execute growchat --remote \\');
  console.log("     --command=\"UPDATE users SET role='admin' WHERE email='YOUR_EMAIL'\"\n");
  console.log(' Or use the Cloudflare dashboard D1 console.\n');
  const understood = await confirm("Understood — I'll promote my account after first login?");
  if (!understood) {
    console.log('   No problem — you can do this manually after deploy.');
  }
}

/** Step 5: Deploy. */
async function stepDeploy() {
  console.log('\n🚀 Step 5: Deploying to Cloudflare Workers\n');

  // Build CSS first
  run('pnpm', ['run', 'build:css'], { label: 'Building CSS' });

  // Deploy
  run('pnpm', ['exec', 'wrangler', 'deploy'], { label: 'Deploying to Cloudflare' });

  console.log('\n✅ Deployment complete!');
}

async function stepSummary() {
  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║ 🎉 GrowChat is live!                                ║
  ║                                                      ║
  ║ Next steps:                                          ║
  ║   1. Open your Workers URL (shown above)             ║
  ║   2. Register your admin account                     ║
  ║   3. Promote to admin via D1 console                 ║
  ║   4. Add an LLM connection in Settings               ║
  ║                                                      ║
  ║ Useful commands:                                     ║
  ║   pnpm run dev       — Local development             ║
  ║   pnpm run deploy    — Re-deploy after changes       ║
  ║   pnpm exec wrangler — Run any wrangler command      ║
  ║                                                      ║
  ║ Docs:   docs/index.md                                ║
  ║ Issues: github.com/tan-yong-sheng/GrowChat/issues    ║
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
    await stepConfigureOrigins();
    await stepCreateAdmin();
    await stepDeploy();
    await stepSummary();
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'ERR_USE_AFTER_CLOSE') {
      // User pressed Ctrl+C
      console.log('\n\n👋 Wizard aborted. Re-run with: pnpm run setup');
      process.exit(0);
    }
    throw err;
  } finally {
    rl.close();
  }
}

main();
