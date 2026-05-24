// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const depcruiseConfig = path.join(repoRoot, '.dependency-cruiser.cjs');
const semgrepConfig = path.join(repoRoot, '.semgrep/rules.yml');
const depcruiseBin = 'node';
const depcruiseScript = path.join(
  repoRoot,
  'node_modules',
  'dependency-cruiser',
  'bin',
  'dependency-cruise.mjs'
);

function makeFixtureRoot() {
  return mkdtempSync(path.join(os.tmpdir(), 'growchat-guardrails-'));
}

function writeFixture(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    timeout: 30000, // Kill subprocess after 30s to prevent CI hangs
  });
}

describe('guardrail fixtures', () => {
  it('rejects frontend imports into src via dependency-cruiser', () => {
    const fixtureRoot = makeFixtureRoot();
    writeFixture(
      fixtureRoot,
      'public/js/features/demo.js',
      "import '../../../src/server.js';\nexport const value = 1;\n"
    );
    writeFixture(fixtureRoot, 'src/server.js', 'export const value = 1;\n');

    const result = run(
      depcruiseBin,
      [
        depcruiseScript,
        '--config',
        depcruiseConfig,
        'public/js',
        'src',
        '--output-type',
        'err-long',
      ],
      fixtureRoot
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).toContain('no-frontend-to-src');
  }, 15000);

  it('rejects frontend worker-env access via semgrep', () => {
    const fixtureRoot = makeFixtureRoot();
    writeFixture(
      fixtureRoot,
      'public/js/features/demo.js',
      'const env = { DB: null };\nconsole.log(env.DB);\n'
    );

    const result = run(
      'semgrep',
      ['scan', '--config', semgrepConfig, '--error', 'public/js/features/demo.js'],
      fixtureRoot
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).toContain(
      'no-frontend-worker-env-access'
    );
  }, 30000);

  it('rejects raw status badge markup in account feature slice via semgrep', () => {
    const fixtureRoot = makeFixtureRoot();
    writeFixture(
      fixtureRoot,
      'public/js/features/account/account-connections.js',
      'export const view = `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border-gray-200 bg-gray-50 text-gray-500">Shared</span>`;\n'
    );

    const result = run(
      'semgrep',
      [
        'scan',
        '--config',
        semgrepConfig,
        '--error',
        'public/js/features/account/account-connections.js',
      ],
      fixtureRoot
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).toContain(
      'no-raw-status-badge-markup-in-account-features'
    );
  }, 30000);

  it('rejects rounded pill action buttons but allows compact toggle switches', () => {
    const fixtureRoot = makeFixtureRoot();
    writeFixture(
      fixtureRoot,
      'public/js/features/demo.js',
      [
        'export const bad = `<button class="inline-flex rounded-full px-4 py-2 text-sm">Run</button>`;',
        'export const good = `<button class="inline-flex h-6 w-11 rounded-full">Toggle</button>`;',
      ].join('\n') + '\n'
    );

    const badResult = run(
      'semgrep',
      ['scan', '--config', semgrepConfig, '--error', 'public/js/features/demo.js'],
      fixtureRoot
    );

    expect(badResult.status).not.toBe(0);
    expect(`${badResult.stdout ?? ''}${badResult.stderr ?? ''}`).toContain(
      'no-raw-pill-button-markup-in-feature-code'
    );

    writeFixture(
      fixtureRoot,
      'public/js/features/demo.js',
      'export const good = `<button class="inline-flex h-6 w-11 rounded-full">Toggle</button>`;\n'
    );

    const goodResult = run(
      'semgrep',
      ['scan', '--config', semgrepConfig, '--error', 'public/js/features/demo.js'],
      fixtureRoot
    );

    expect(goodResult.status).toBe(0);
  }, 30000);

  it('rejects raw model access badge markup in account/admin model settings pages', () => {
    const fixtureRoot = makeFixtureRoot();
    writeFixture(
      fixtureRoot,
      'public/js/features/account/account-models.js',
      [
        'export const row = `<span data-model-access="gpt-4" class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border-gray-200 bg-gray-50 text-gray-600">Shared</span>`;',
      ].join('\n') + '\n'
    );

    // Single --json run: avoids terminal line-wrapping issues with long rule IDs
    // and consolidates exit-status + rule-id checks into one semgrep invocation
    const result = run(
      'semgrep',
      ['scan', '--config', semgrepConfig, '--json', 'public/js/features/account/account-models.js'],
      fixtureRoot
    );
    let foundBadgeRule = false;
    let parsed = { results: [] };
    try {
      parsed = JSON.parse(result.stdout);
      foundBadgeRule = (parsed.results ?? []).some((r) =>
        r.check_id?.includes('no-raw-model-access-badge-markup-in-model-settings-features')
      );
    } catch {
      /* ignore parse errors */
    }
    expect(parsed.results.length).toBeGreaterThan(0);
    expect(foundBadgeRule).toBe(true);
  }, 30000);

  it('rejects direct getModelAccessPresentation usage in model settings pages', () => {
    const fixtureRoot = makeFixtureRoot();
    writeFixture(
      fixtureRoot,
      'public/js/features/admin/settings/models.js',
      [
        "import { getModelAccessPresentation } from '../../../shared/utils/model-access-presentation.js';",
        'export const render = (model) => getModelAccessPresentation(model);',
      ].join('\n') + '\n'
    );

    // Single --json run: avoids terminal line-wrapping issues with long rule IDs
    const result = run(
      'semgrep',
      ['scan', '--config', semgrepConfig, '--json', 'public/js/features/admin/settings/models.js'],
      fixtureRoot
    );
    let foundPresentationRule = false;
    let parsed = { results: [] };
    try {
      parsed = JSON.parse(result.stdout);
      foundPresentationRule = (parsed.results ?? []).some((r) =>
        r.check_id?.includes('no-direct-model-access-presentation-in-model-settings-features')
      );
    } catch {
      /* ignore parse errors */
    }
    expect(parsed.results.length).toBeGreaterThan(0);
    expect(foundPresentationRule).toBe(true);
  }, 30000);

  it('rejects console.log usage in src/ files via ESLint (structured logging regression guard)', () => {
    const fixtureRoot = makeFixtureRoot();
    writeFixture(
      fixtureRoot,
      'src/utils/example.js',
      "export function doThing() { console.log('oops'); }\n"
    );
    const eslintBin = path.join(repoRoot, 'node_modules', '.bin', 'eslint');
    const eslintConfig = path.join(repoRoot, 'eslint.config.cjs');
    const result = run(
      eslintBin,
      ['src/utils/example.js', '--config', eslintConfig, '--no-ignore'],
      fixtureRoot
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).toContain('no-console-logging');
  }, 40000);
});
