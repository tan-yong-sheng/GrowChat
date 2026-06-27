// Regression test for PR #173 review thread MsX96:
// `.husky/pre-push` must transitively invoke `pnpm run test` (vitest) so
// failed unit tests cannot reach the remote.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadPackage() {
  return JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
}

function loadPrePushHook() {
  return readFileSync(resolve(repoRoot, '.husky/pre-push'), 'utf8').trim();
}

function collectScriptChain(topName, scripts) {
  const visited = new Set();
  function visit(name) {
    if (visited.has(name)) return;
    visited.add(name);
    const cmd = scripts[name];
    if (!cmd) return;
    for (const match of cmd.matchAll(/pnpm\s+run\s+([\w:-]+)/g)) {
      visit(match[1]);
    }
  }
  visit(topName);
  return [...visited];
}

describe('pre-push hook', () => {
  it('transitively runs the vitest unit suite', () => {
    const pkg = loadPackage();
    const hook = loadPrePushHook();

    const hookMatch = hook.match(/pnpm\s+run\s+([\w:-]+)/);
    expect(hookMatch, `pre-push hook must call a pnpm run script, got: ${hook}`).not.toBeNull();

    const topName = hookMatch[1];
    const chain = collectScriptChain(topName, pkg.scripts);

    const invokesVitest = chain.some((name) =>
      /(?:\bpnpm\s+run\s+test\b|\bvitest\s+run\b)/.test(pkg.scripts[name] ?? '')
    );

    expect(
      invokesVitest,
      `pre-push chain [${chain.join(', ')}] must invoke vitest so unit failures gate pushes`
    ).toBe(true);
  });
});
