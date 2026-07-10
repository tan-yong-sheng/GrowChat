#!/usr/bin/env node
/**
 * GrowChat Setup Wizard — main orchestrator.
 *
 * Interactive CLI that takes a new user from zero to a deployed GrowChat
 * instance. Creates all required Cloudflare resources, sets secrets, applies
 * migrations, and deploys.
 *
 * Usage:
 *   pnpm run setup
 *   node scripts/setup-wizard.js
 *
 * Architecture:
 *   setup-wizard-utils.js — shared prompts, command runners, output parsers
 *   setup-wizard-steps.js — wizard step functions (welcome, deploy, etc.)
 *   setup-wizard.js (this file) — main() orchestrator that calls the steps
 */
import { createRl, setRl } from './setup-wizard-utils.js';
import {
  stepWelcome,
  stepCreateResources,
  stepApplyMigrations,
  stepSetSecrets,
  stepConfigureOrigins,
  stepCreateAdmin,
  stepDeploy,
  stepSummary,
} from './setup-wizard-steps.js';

async function main() {
  console.clear();
  const interfaceInstance = createRl();
  setRl(interfaceInstance);

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
      console.log('\n\n\uD83D\uDC4B Wizard aborted. Re-run with: pnpm run setup');
      process.exit(0);
    }
    throw err;
  } finally {
    interfaceInstance.close();
  }
}

main();
