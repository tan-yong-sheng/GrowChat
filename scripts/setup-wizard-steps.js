#!/usr/bin/env node
/**
 * GrowChat Setup Wizard — wizard steps.
 *
 * Each step function orchestrates one phase of the interactive setup
 * (welcome, create resources, apply migrations, set secrets, configure
 * origins, create admin, deploy, summary).
 *
 * Steps import utilities from setup-wizard-utils.js (prompts, command
 * runners, output parsers) and read environment variables directly via
 * process.env.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ROOT,
  prompt,
  confirm,
  run,
  setSecret,
  generateSecret,
  parseD1DatabaseId,
  parseKvNamespaceId,
  handleCustomSecret,
  handleEnvSecret,
  secretPrompt,
} from './setup-wizard-utils.js';

/** Step 0: Welcome the user and confirm they're ready. */
export async function stepWelcome() {
  console.log(`

  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  \u2551 \uD83C\uDF31 GrowChat Setup Wizard                            \u2551
  \u2551                                                      \u2551
  \u2551 This wizard will set up everything you need to       \u2551
  \u2551 deploy GrowChat to Cloudflare Workers.               \u2551
  \u2551                                                      \u2551
  \u2551 It will:                                             \u2551
  \u2551   1. Create D1 database, R2 bucket, KV namespaces   \u2551
  \u2551   2. Apply database migrations                       \u2551
  \u2551   3. Set your secrets (JWT, API keys)                \u2551
  \u2551   4. Configure ALLOWED_ORIGINS for CORS              \u2551
  \u2551   5. Deploy to Cloudflare                            \u2551
  \u2551                                                     \u2551
  \u2551 Tip: Set env vars JWT_SECRET, RESEND_API_KEY,      \u2551
  \u2551      RESEND_FROM_EMAIL to skip interactive prompts  \u2551
  \u2551                                                      \u2551
  \u2551 Press Ctrl+C at any time to abort.                   \u2551
  \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  `);
  const ready = await confirm('Ready to begin?', { default: true });
  if (!ready) {
    console.log('\n\uD83D\uDC4B Wizard cancelled. Re-run with: pnpm run setup');
    process.exit(0);
  }
}

/**
 * Handle a failed resource creation command.
 * If the output indicates the resource already exists, logs a skip message.
 * Otherwise, displays the error and asks whether to continue.
 */
function isAlreadyExists(stdout, stderr) {
  const combined = `${stdout} ${stderr}`.toLowerCase();
  return (
    combined.includes('already exists') ||
    combined.includes('already been created') ||
    combined.includes('name is already taken')
  );
}

async function handleCreateError(result, resourceLabel) {
  if (isAlreadyExists(result.stdout, result.stderr)) {
    console.log(` ${resourceLabel} already exists \u2014 skipping.`);
  } else {
    console.error(`\n\u274c ${resourceLabel} creation failed with an unexpected error:`);
    console.error(result.stderr || result.stdout);
    const continueAnyway = await confirm('Skip and continue anyway?', {
      default: false,
    });
    if (!continueAnyway) process.exit(1);
  }
}

/**
 * Update wrangler.jsonc D1 database ID in-place.
 * Updates both database_id and preview_database_id.
 */
function updateWranglerD1Id(dbId) {
  const wranglerPath = resolve(ROOT, 'wrangler.jsonc');
  let content = readFileSync(wranglerPath, 'utf-8');

  // Replace database_id \u2014 order-independent within the d1_databases block
  content = content.replace(/("database_id"\s*:\s*")([^"]*)(")/, `$1${dbId}$3`);
  // Replace preview_database_id
  content = content.replace(/("preview_database_id"\s*:\s*")([^"]*)(")/, `$1${dbId}$3`);

  writeFileSync(wranglerPath, content);
  console.log(' \u270f\ufe0f wrangler.jsonc updated with D1 database ID.');
}

/**
 * Update wrangler.jsonc KV namespace IDs in-place.
 * Uses a two-step approach: first find the KV block for a binding,
 * then replace id/preview_id within that block. This is order-independent \u2014
 * works whether "binding" comes before or after "id" in the JSON.
 */
function updateWranglerKvIds(ids) {
  const wranglerPath = resolve(ROOT, 'wrangler.jsonc');
  let content = readFileSync(wranglerPath, 'utf-8');

  for (const [binding, newId] of Object.entries(ids)) {
    const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRegex = new RegExp(`\\{[^{}]*"binding"\\s*:\\s*"${escapedBinding}"[^{}]*\\}`, 'g');
    content = content.replace(blockRegex, (match) => {
      let block = match;
      block = block.replace(/("id"\s*:\s*")([^"]*)(")/, `$1${newId}$3`);
      block = block.replace(/("preview_id"\s*:\s*")([^"]*)(")/, `$1${newId}$3`);
      return block;
    });
  }

  writeFileSync(wranglerPath, content);
  console.log(' \u270f\ufe0f wrangler.jsonc updated with KV namespace IDs.');
}

const KV_NAMESPACES = ['CHAT_SESSIONS', 'SESSIONS', 'CACHE'];
const ID_DISPLAY_PREFIX_LEN = 8;

async function stepCreateD1Database() {
  const dbResult = run('pnpm', ['exec', 'wrangler', 'd1', 'create', 'growchat'], {
    exitOnError: false,
    label: 'Creating D1 database "growchat"',
    captureOutput: true,
  });

  if (!dbResult.ok) {
    await handleCreateError(dbResult, 'D1 database "growchat"');
    return;
  }

  const dbId = parseD1DatabaseId(dbResult.stdout);
  if (!dbId) {
    console.log('  \u26a0\ufe0f Could not parse database_id from output.');
    const manualDbId = await prompt('Enter the D1 database ID');
    if (manualDbId) updateWranglerD1Id(manualDbId);
    return;
  }

  console.log(`  Found database_id: ${dbId.substring(0, ID_DISPLAY_PREFIX_LEN)}...`);
  const autoUpdate = await confirm('Auto-update wrangler.jsonc with this D1 database ID?');
  if (autoUpdate) updateWranglerD1Id(dbId);
}

async function stepCreateR2Bucket() {
  const r2Result = run('pnpm', ['exec', 'wrangler', 'r2', 'bucket', 'create', 'growchat-files'], {
    exitOnError: false,
    label: 'Creating R2 bucket "growchat-files"',
    captureOutput: true,
  });
  if (!r2Result.ok) {
    await handleCreateError(r2Result, 'R2 bucket "growchat-files"');
  }
}

async function createSingleKvNamespace(ns) {
  const kvResult = run('pnpm', ['exec', 'wrangler', 'kv', 'namespace', 'create', ns], {
    exitOnError: false,
    label: `Creating KV namespace "${ns}"`,
    captureOutput: true,
  });

  if (kvResult.ok) {
    const kvId = parseKvNamespaceId(kvResult.stdout);
    if (kvId) {
      console.log(`  Found ID: ${kvId.substring(0, ID_DISPLAY_PREFIX_LEN)}...`);
      return kvId;
    }
    const manualId = await prompt(`Enter the KV namespace ID for ${ns}`);
    return manualId || undefined;
  }

  await handleCreateError(kvResult, `KV namespace "${ns}"`);
  return undefined;
}

async function maybeUpdateWranglerKvIds(kvIds) {
  if (Object.keys(kvIds).length === 0) return;
  const autoUpdate = await confirm('Auto-update wrangler.jsonc with the KV namespace IDs above?');
  if (autoUpdate) updateWranglerKvIds(kvIds);
}

async function stepCreateKvNamespaces() {
  const kvIds = {};
  for (const ns of KV_NAMESPACES) {
    const kvId = await createSingleKvNamespace(ns);
    if (kvId) kvIds[ns] = kvId;
  }

  await maybeUpdateWranglerKvIds(kvIds);
}

/** Step 1: Create Cloudflare resources. */
export async function stepCreateResources() {
  console.log('\n\uD83D\uDCE1 Step 1: Creating Cloudflare resources\n');
  console.log(" We'll create the D1 database, R2 bucket, and KV namespaces");
  console.log(" needed by GrowChat. If a resource already exists, we'll skip it.\n");

  await stepCreateD1Database();
  await stepCreateR2Bucket();
  await stepCreateKvNamespaces();

  console.log('\n\u2705 Cloudflare resources ready.');
}

/**
 * Update wrangler.jsonc ALLOWED_ORIGINS in-place.
 * Takes a string (comma-separated origins) or null to leave unchanged.
 * Rejects placeholder values shipped in template/wrangler.jsonc.
 */
function updateWranglerAllowedOrigins(value) {
  if (value == null || value === '') return false;

  const trimmed = String(value).trim();
  if (!trimmed) return false;

  const forbidden = ['https://YOUR_WORKERS_URL', 'https://REPLACE_WITH_YOUR_DOMAIN', '*'];
  if (forbidden.includes(trimmed) || /REPLACE_WITH|YOUR_|PLACEHOLDER/i.test(trimmed)) {
    return false;
  }

  const wranglerPath = resolve(ROOT, 'wrangler.jsonc');
  const content = readFileSync(wranglerPath, 'utf-8');

  const updated = content.replace(
    /("ALLOWED_ORIGINS"\s*:\s*")([^"]*)(")/g,
    (_match, prefix, _old, suffix) => `${prefix}${trimmed}${suffix}`
  );

  if (updated === content) return false;

  writeFileSync(wranglerPath, updated);
  return true;
}

/** Step 2: Apply D1 migrations. */
export async function stepApplyMigrations() {
  console.log('\n\u{1F5C4}\uFE0F Step 2: Applying D1 migrations\n');

  const migrationsDir = resolve(ROOT, 'migrations');
  if (!existsSync(migrationsDir)) {
    console.error(' \u274c No migrations/ directory found. Cannot apply migrations.');
    process.exit(1);
  }

  run('pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'growchat', '--remote'], {
    label: 'Applying D1 migrations (remote)',
  });

  console.log('\n\u2705 D1 migrations applied.');
}

async function promptJwtSecret() {
  const envJwt = process.env.JWT_SECRET;
  const defaultJwt = envJwt || generateSecret();

  if (envJwt) {
    const used = await handleEnvSecret('JWT_SECRET', envJwt);
    if (!used) {
      const jwtSecret = await secretPrompt('Enter your own JWT_SECRET');
      setSecret('JWT_SECRET', jwtSecret || defaultJwt);
      console.log(' \u2705 JWT_SECRET set.\n');
    }
    return;
  }

  console.log(' JWT_SECRET is used to sign authentication tokens.');
  console.log(' A random one has been generated for you.');
  const useDefaultJwt = await confirm('Use the generated JWT secret?', { default: true });
  if (useDefaultJwt) {
    setSecret('JWT_SECRET', defaultJwt);
  } else {
    const jwtSecret = await secretPrompt('Enter your own JWT_SECRET');
    if (!jwtSecret) {
      console.error(
        ' \u274c JWT_SECRET cannot be empty. Please re-run the wizard and provide a value.\n'
      );
      process.exit(1);
    }
    setSecret('JWT_SECRET', jwtSecret);
  }
  console.log(' \u2705 JWT_SECRET set.\n');
}

async function promptResendApiKey() {
  const envResendKey = process.env.RESEND_API_KEY;
  let hasResend = false;

  console.log(' RESEND_API_KEY is used for transactional emails (password reset).');
  console.log(' This is optional \u2014 you can set it later via:');
  console.log(' pnpm exec wrangler secret put RESEND_API_KEY\n');

  if (envResendKey) {
    hasResend = await handleEnvSecret('RESEND_API_KEY', envResendKey);
  }

  if (!hasResend) {
    hasResend = await confirm('Do you have a Resend API key?');
    if (hasResend) {
      const keySet = await handleCustomSecret('RESEND_API_KEY');
      hasResend = keySet;
    } else {
      console.log(
        ' \u23ed\ufe0f Skipped RESEND_API_KEY \u2014 emails will not work until this is set.\n'
      );
    }
  }

  return hasResend;
}

async function promptResendFromEmail(hasResend) {
  if (!hasResend) return;
  const envResendFrom = process.env.RESEND_FROM_EMAIL;
  const defaultFrom = envResendFrom || 'onboarding@resend.dev';
  const resendFrom = await prompt('RESEND_FROM_EMAIL', { default: defaultFrom });
  if (resendFrom) {
    setSecret('RESEND_FROM_EMAIL', resendFrom);
    console.log(' \u2705 RESEND_FROM_EMAIL set.\n');
  }
}

/** Step 3: Set secrets. */
export async function stepSetSecrets() {
  console.log('\n\u{1F510} Step 3: Setting secrets\n');
  console.log(' Secrets are stored securely in Cloudflare \u2014 never written to files.\n');

  await promptJwtSecret();
  const hasResend = await promptResendApiKey();
  await promptResendFromEmail(hasResend);

  console.log('\u2705 Secrets configured.');
}

const MAX_ORIGIN_ATTEMPTS = 3;
const PLACEHOLDER_REGEX = /REPLACE_WITH|YOUR_|PLACEHOLDER|<.*>/i;
const ORIGIN_ENTRY_REGEX = /^https?:\/\//;

function isPlaceholderOrigin(value) {
  return !value || PLACEHOLDER_REGEX.test(value);
}

function splitAndValidateOrigins(answer) {
  const entries = answer
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const invalid = entries.filter((e) => !ORIGIN_ENTRY_REGEX.test(e));
  return { entries, invalid };
}

async function attemptConfigureOrigins() {
  const answer = await prompt('ALLOWED_ORIGINS (comma-separated, no quotes)', {
    default: 'https://<your-subdomain>.workers.dev',
  });

  if (isPlaceholderOrigin(answer)) {
    console.log('  \u26a0\ufe0f That looks like a placeholder. Enter a real https:// origin.');
    return false;
  }

  const { entries, invalid } = splitAndValidateOrigins(answer);
  if (invalid.length > 0) {
    console.log(
      `  \u26a0\ufe0f Each origin must start with http:// or https://. Invalid: ${invalid.join(', ')}`
    );
    return false;
  }

  const ok = updateWranglerAllowedOrigins(entries.join(','));
  if (!ok) {
    console.log(
      '  \u26a0\ufe0f Could not update wrangler.jsonc \u2014 check the file is writable.'
    );
    return false;
  }

  console.log(`  \u2705 ALLOWED_ORIGINS set to: ${entries.join(', ')}\n`);
  return true;
}

/**
 * Step 4: Configure ALLOWED_ORIGINS for production.
 * The template ships a non-resolving placeholder so a user can't accidentally
 * deploy with the old "*" wildcard (CSRF risk). This step prompts for the
 * real production origin(s) and writes them to wrangler.jsonc.
 */
export async function stepConfigureOrigins() {
  console.log('\n\uD83C\uDF10 Step 4: Configure ALLOWED_ORIGINS\n');
  console.log(' GrowChat blocks cross-origin requests from origins that aren\u2019t on this list.');
  console.log(' This is a security control against CSRF and unauthorized API access.\n');
  console.log(' Enter one or more origins separated by commas. Examples:');
  console.log('   https://chat.example.com');
  console.log('   https://chat.example.com,https://staging.example.com');
  console.log('   https://<your-subdomain>.workers.dev  (for the default Workers URL)\n');

  let configured = false;
  for (let attempts = 0; attempts < MAX_ORIGIN_ATTEMPTS && !configured; attempts += 1) {
    configured = await attemptConfigureOrigins();
  }

  if (!configured) {
    console.error('\n\u274c Failed to configure ALLOWED_ORIGINS after 3 attempts.');
    console.error('   Edit wrangler.jsonc \u2192 vars.ALLOWED_ORIGINS manually before deploying.');
    process.exit(1);
  }
}

/** Step 5: Create admin account. */
export async function stepCreateAdmin() {
  console.log('\n\uD83D\uDC64 Step 5: Create admin account\n');
  console.log(' After deployment, register your admin account at the app URL.');
  console.log(' Then promote the account to admin via the D1 console:\n');
  console.log('   pnpm exec wrangler d1 execute growchat --remote \\');
  console.log("     --command=\"UPDATE users SET role='admin' WHERE email='YOUR_EMAIL'\"\n");
  console.log(' Or use the Cloudflare dashboard D1 console.\n');
  const understood = await confirm("Understood \u2014 I'll promote my account after first login?");
  if (!understood) {
    console.log('   No problem \u2014 you can do this manually after deploy.');
  }
}

/** Step 6: Deploy. */
export async function stepDeploy() {
  console.log('\n\uD83D\uDE80 Step 6: Deploying to Cloudflare Workers\n');

  run('pnpm', ['run', 'build:css'], { label: 'Building CSS' });
  run('pnpm', ['exec', 'wrangler', 'deploy'], { label: 'Deploying to Cloudflare' });

  console.log('\n\u2705 Deployment complete!');
}

/** Final: print a summary banner. */
export async function stepSummary() {
  console.log(`
  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  \u2551 \uD83C\uDF89 GrowChat is live!                                \u2551
  \u2551                                                      \u2551
  \u2551 Next steps:                                          \u2551
  \u2551   1. Open your Workers URL (shown above)             \u2551
  \u2551   2. Register your admin account                     \u2551
  \u2551   3. Promote to admin via D1 console                 \u2551
  \u2551   4. Add an LLM connection in Settings               \u2551
  \u2551                                                      \u2551
  \u2551 Useful commands:                                     \u2551
  \u2551   pnpm run dev       \u2014 Local development             \u2551
  \u2551   pnpm run deploy    \u2014 Re-deploy after changes       \u2551
  \u2551   pnpm exec wrangler \u2014 Run any wrangler command      \u2551
  \u2551                                                      \u2551
  \u2551 Docs:   docs/index.md                                \u2551
  \u2551 Issues: github.com/tan-yong-sheng/GrowChat/issues    \u2551
  \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  `);
}
