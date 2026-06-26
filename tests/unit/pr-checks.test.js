/**
 * Tests for scripts/pr-checks.js — the offline PR semantic check that
 * replaces `danger ci`.
 *
 * Replaces Danger because the latter consistently failed with
 * ERR_STREAM_PREMATURE_CLOSE (node-fetch v2 + gzipped GitHub API responses
 * for large PRs). The two validations are simple enough to replicate
 * without a third-party CI library:
 *
 *   1. PR body must be at least 10 characters long.
 *   2. If package.json is modified, pnpm-lock.yaml must also be modified.
 *
 * Inputs are read from environment variables (PR_BODY, PR_BASE_REF) and
 * `git diff --name-only $PR_BASE_REF...HEAD`, so the check is fully offline.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const spawnSync = vi.fn();
vi.mock('node:child_process', () => ({
  spawnSync: (...args) => spawnSync(...args),
}));

const { validate, getChangedFiles, runChecks, MIN_BODY_LENGTH } =
  await import('../../scripts/pr-checks.js');

beforeEach(() => {
  spawnSync.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validate (pure)', () => {
  it('passes for a non-trivial body with no package.json change', () => {
    expect(validate('A real PR description with details.', ['src/foo.js'])).toEqual([]);
  });

  it('fails when body is shorter than minimum', () => {
    const errors = validate('short', ['src/foo.js']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/PR body is too short/);
  });

  it('fails when body is empty', () => {
    const errors = validate('', ['src/foo.js']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/PR body is too short/);
  });

  it('fails when body is null/undefined', () => {
    expect(validate(null, ['src/foo.js'])).toHaveLength(1);
    expect(validate(undefined, ['src/foo.js'])).toHaveLength(1);
  });

  it('fails when package.json is modified without pnpm-lock.yaml', () => {
    const errors = validate('A real PR description with details.', ['package.json', 'src/foo.js']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/package.json was modified but pnpm-lock\.yaml was not/);
  });

  it('passes when package.json AND pnpm-lock.yaml are both modified', () => {
    expect(
      validate('A real PR description with details.', ['package.json', 'pnpm-lock.yaml'])
    ).toEqual([]);
  });

  it('reports both errors at once (body too short + lockfile missing)', () => {
    const errors = validate('tiny', ['package.json', 'src/foo.js']);
    expect(errors).toHaveLength(2);
  });

  it('respects MIN_BODY_LENGTH constant', () => {
    const justUnder = 'x'.repeat(MIN_BODY_LENGTH - 1);
    const exactlyAt = 'x'.repeat(MIN_BODY_LENGTH);
    expect(validate(justUnder, [])).toHaveLength(1);
    expect(validate(exactlyAt, [])).toEqual([]);
  });
});

describe('getChangedFiles', () => {
  it('runs git diff with the given base ref', () => {
    spawnSync.mockReturnValue({
      status: 0,
      signal: null,
      pid: 1,
      output: [],
      stdout: 'src/foo.js\nREADME.md\n',
      stderr: '',
    });
    const files = getChangedFiles('origin/main');
    expect(files).toEqual(['src/foo.js', 'README.md']);
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      ['diff', '--name-only', 'origin/main...HEAD'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });

  it('returns an empty list when diff has no changes', () => {
    spawnSync.mockReturnValue({
      status: 0,
      signal: null,
      pid: 1,
      output: [],
      stdout: '',
      stderr: '',
    });
    expect(getChangedFiles('origin/main')).toEqual([]);
  });

  it('handles trailing newlines and extra blank lines', () => {
    spawnSync.mockReturnValue({
      status: 0,
      signal: null,
      pid: 1,
      output: [],
      stdout: 'package.json\npnpm-lock.yaml\n\n',
      stderr: '',
    });
    expect(getChangedFiles('origin/main')).toEqual(['package.json', 'pnpm-lock.yaml']);
  });

  it('exits the process when git diff fails', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`__exit__:${code}`);
    });
    spawnSync.mockReturnValue({
      status: 128,
      signal: null,
      pid: 1,
      output: [],
      stdout: '',
      stderr: 'fatal: bad revision',
    });
    expect(() => getChangedFiles('origin/main')).toThrow('__exit__:1');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

describe('runChecks (CLI entrypoint)', () => {
  let exitSpy;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`__exit__:${code}`);
    });
  });

  afterEach(() => {
    exitSpy.mockRestore();
    delete process.env.PR_BODY;
    delete process.env.PR_BASE_REF;
  });

  it('passes when env vars and git diff are consistent', () => {
    process.env.PR_BODY = 'A real PR description with details.';
    process.env.PR_BASE_REF = 'origin/main';
    spawnSync.mockReturnValue({
      status: 0,
      signal: null,
      pid: 1,
      output: [],
      stdout: 'src/foo.js\n',
      stderr: '',
    });
    expect(() => runChecks()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('uses origin/main when PR_BASE_REF is unset', () => {
    process.env.PR_BODY = 'A real PR description with details.';
    spawnSync.mockReturnValue({
      status: 0,
      signal: null,
      pid: 1,
      output: [],
      stdout: '',
      stderr: '',
    });
    runChecks();
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      ['diff', '--name-only', 'origin/main...HEAD'],
      expect.objectContaining({ encoding: 'utf8' })
    );
  });

  it('exits 1 when validation fails', () => {
    process.env.PR_BODY = 'tiny';
    process.env.PR_BASE_REF = 'origin/main';
    spawnSync.mockReturnValue({
      status: 0,
      signal: null,
      pid: 1,
      output: [],
      stdout: '',
      stderr: '',
    });
    expect(() => runChecks()).toThrow('__exit__:1');
  });
});
