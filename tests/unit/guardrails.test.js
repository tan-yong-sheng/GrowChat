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
  }, 10000);

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
  }, 20000);
});
