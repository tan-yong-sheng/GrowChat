/**
 * Tests for scripts/lib/port-check.js — the port occupancy pre-check used by
 * scripts/test-e2e.js to avoid hanging when TEST_PORT is occupied by a zombie
 * process.
 *
 * These tests exercise the contract:
 *   - A free port reports as unoccupied.
 *   - An occupied port reports as occupied.
 *   - We can identify the PID and process name of a listener.
 *   - We only kill processes that look like our own (wrangler / workerd / node).
 *   - Foreign processes trigger a fail-fast exit with a clear message.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let netMocks;
let childProcessMocks;
let fsMocks;

vi.mock('node:net', () => {
  netMocks = {
    createServer: vi.fn(() => ({
      once: vi.fn(),
      listen: vi.fn(),
      close: vi.fn((cb) => (cb ? cb() : undefined)),
    })),
  };
  return netMocks;
});

vi.mock('node:child_process', () => {
  childProcessMocks = {
    execSync: vi.fn(),
    execFileSync: vi.fn(),
  };
  return childProcessMocks;
});

vi.mock('node:fs', () => {
  fsMocks = {
    readFileSync: vi.fn(),
  };
  return fsMocks;
});

const {
  checkPortOccupied,
  findPortPid,
  getProcessName,
  isOurProcess,
  signalProcess,
  killPortProcess,
  ensurePortAvailable,
} = await import('../../scripts/lib/port-check.js');

function makeServer() {
  const handlers = {};
  const server = {
    once: (event, fn) => {
      handlers[event] = fn;
    },
    listen: () => {},
    close: (cb) => (cb ? cb() : undefined),
    emit: (event, ...args) => {
      if (handlers[event]) handlers[event](...args);
    },
  };
  return server;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkPortOccupied', () => {
  it('returns false when the port is free', async () => {
    const server = makeServer();
    netMocks.createServer.mockReturnValue(server);

    const promise = checkPortOccupied(8788);
    server.emit('listening');

    await expect(promise).resolves.toBe(false);
  });

  it('returns true when the port is occupied', async () => {
    const server = makeServer();
    netMocks.createServer.mockReturnValue(server);

    const promise = checkPortOccupied(8788);
    server.emit('error', { code: 'EADDRINUSE' });

    await expect(promise).resolves.toBe(true);
  });

  it('returns true on EACCES (port blocked)', async () => {
    const server = makeServer();
    netMocks.createServer.mockReturnValue(server);

    const promise = checkPortOccupied(8788);
    server.emit('error', { code: 'EACCES' });

    await expect(promise).resolves.toBe(true);
  });
});

describe('findPortPid', () => {
  it('returns the PID from lsof output without invoking a shell', () => {
    childProcessMocks.execFileSync.mockReturnValue('12345\n');

    expect(findPortPid(8788)).toBe(12345);
    expect(childProcessMocks.execFileSync).toHaveBeenCalledWith('lsof', ['-t', '-i', ':8788'], {
      encoding: 'utf8',
    });
    // Regression guard: the module must not invoke execSync (shell) for the lsof path.
    expect(childProcessMocks.execSync).not.toHaveBeenCalled();
  });

  it('falls back to ss when lsof fails', () => {
    childProcessMocks.execFileSync
      .mockImplementationOnce(() => {
        throw new Error('lsof failed');
      })
      .mockReturnValue('LISTEN 0 511 0.0.0.0:8788 0.0.0.0:* users:(("node",pid=67890,fd=12))');

    expect(findPortPid(8788)).toBe(67890);
    expect(childProcessMocks.execFileSync).toHaveBeenLastCalledWith(
      'ss',
      ['-tlnp', 'sport = :8788'],
      { encoding: 'utf8' }
    );
  });

  it('returns null when no listener is found', () => {
    childProcessMocks.execFileSync.mockImplementation(() => {
      throw new Error('no results');
    });

    expect(findPortPid(8788)).toBeNull();
  });

  it('throws TypeError on a non-integer port (defense against CodeQL injection findings)', () => {
    expect(() => findPortPid('8787; rm -rf /')).toThrow(TypeError);
    expect(() => findPortPid(0)).toThrow(TypeError);
    expect(() => findPortPid(-1)).toThrow(TypeError);
    expect(() => findPortPid(3.14)).toThrow(TypeError);
    expect(() => findPortPid(Number.NaN)).toThrow(TypeError);
    expect(childProcessMocks.execFileSync).not.toHaveBeenCalled();
  });
});

describe('getProcessName', () => {
  it('reads /proc/PID/comm on Linux', () => {
    fsMocks.readFileSync.mockReturnValue('node\n');

    expect(getProcessName(12345)).toBe('node');
    expect(fsMocks.readFileSync).toHaveBeenCalledWith('/proc/12345/comm', 'utf8');
  });

  it('falls back to ps without invoking a shell when /proc is unavailable', () => {
    fsMocks.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    childProcessMocks.execFileSync.mockReturnValue('node\n');

    expect(getProcessName(12345)).toBe('node');
    expect(childProcessMocks.execFileSync).toHaveBeenCalledWith(
      'ps',
      ['-o', 'comm=', '-p', '12345'],
      { encoding: 'utf8' }
    );
    // Regression guard: no shell interpolation.
    expect(childProcessMocks.execSync).not.toHaveBeenCalled();
  });

  it('returns null when both sources fail', () => {
    fsMocks.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    childProcessMocks.execFileSync.mockImplementation(() => {
      throw new Error('no such process');
    });

    expect(getProcessName(12345)).toBeNull();
  });

  it('throws TypeError on a non-integer pid (defense against CodeQL injection findings)', () => {
    expect(() => getProcessName('12345; rm -rf /')).toThrow(TypeError);
    expect(() => getProcessName(0)).toThrow(TypeError);
    expect(() => getProcessName(-42)).toThrow(TypeError);
    expect(() => getProcessName(1.5)).toThrow(TypeError);
    expect(() => getProcessName(Number.NaN)).toThrow(TypeError);
    expect(childProcessMocks.execFileSync).not.toHaveBeenCalled();
  });
});

describe('isOurProcess', () => {
  it.each(['wrangler', 'workerd', 'node', 'NODE', 'Wrangler'])('identifies %s as ours', (name) => {
    expect(isOurProcess(name)).toBe(true);
  });

  it.each(['chrome', 'postgres', 'ssh', 'systemd'])('identifies %s as foreign', (name) => {
    expect(isOurProcess(name)).toBe(false);
  });

  it('returns false for null/unknown process names', () => {
    expect(isOurProcess(null)).toBe(false);
    expect(isOurProcess('')).toBe(false);
  });
});

describe('killPortProcess', () => {
  it('kills a wrangler listener and waits for the port to free', async () => {
    childProcessMocks.execFileSync
      .mockReturnValueOnce('12345') // lsof
      .mockReturnValueOnce('wrangler\n'); // ps comm

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {});
    let occupied = true;
    netMocks.createServer.mockImplementation(() => {
      const server = makeServer();
      server.listen = () => {
        setTimeout(() => {
          if (occupied) {
            server.emit('error', { code: 'EADDRINUSE' });
          } else {
            server.emit('listening');
          }
        }, 0);
      };
      return server;
    });

    // Occupancy flips to false after the first SIGTERM attempt.
    const checkPromise = killPortProcess(8788, { timeoutMs: 500, pollMs: 10 });
    setTimeout(() => {
      occupied = false;
    }, 50);

    const result = await checkPromise;

    expect(result).toEqual({ killed: true, pid: 12345, name: 'wrangler' });
    expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
    killSpy.mockRestore();
  });

  it('refuses to kill a foreign process and reports not-ours', async () => {
    childProcessMocks.execFileSync
      .mockReturnValueOnce('12345') // lsof
      .mockReturnValueOnce('chrome\n'); // ps comm

    const result = await killPortProcess(8788);

    expect(result).toEqual({ killed: false, pid: 12345, name: 'chrome', reason: 'not-ours' });
  });

  it('returns killed:false when no listener PID is found', async () => {
    childProcessMocks.execFileSync.mockImplementation(() => {
      throw new Error('no results');
    });

    const result = await killPortProcess(8788);

    expect(result).toEqual({ killed: false, pid: null, name: null, reason: 'no-pid' });
  });
});

describe('ensurePortAvailable', () => {
  it('resolves immediately when the port is free', async () => {
    const log = vi.fn();
    const exit = vi.fn();

    await ensurePortAvailable(8788, {
      log,
      exit,
      checkPortOccupied: async () => false,
      killPortProcess: async () => ({ killed: true, pid: 1, name: 'node' }),
    });

    expect(log).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('kills our process and resolves', async () => {
    const log = vi.fn();
    const exit = vi.fn();

    await ensurePortAvailable(8788, {
      log,
      exit,
      checkPortOccupied: async () => true,
      killPortProcess: async () => ({ killed: true, pid: 12345, name: 'wrangler' }),
    });

    expect(log).toHaveBeenCalledWith(
      '[test-e2e] Killed lingering wrangler (PID 12345) on port 8788'
    );
    expect(exit).not.toHaveBeenCalled();
  });

  it('fails fast with the expected message when a foreign process holds the port', async () => {
    const log = vi.fn();
    const exit = vi.fn();

    await ensurePortAvailable(8788, {
      log,
      exit,
      checkPortOccupied: async () => true,
      killPortProcess: async () => ({
        killed: false,
        pid: 12345,
        name: 'chrome',
        reason: 'not-ours',
      }),
    });

    expect(exit).toHaveBeenCalled();
    const messages = log.mock.calls.map((c) => c.join(' '));
    expect(messages.some((m) => m.includes('FATAL: Port 8788 is occupied by PID 12345'))).toBe(
      true
    );
    expect(messages.some((m) => m.includes('process: chrome'))).toBe(true);
    expect(messages.some((m) => m.includes('Kill it manually: kill -9 12345'))).toBe(true);
  });

  it('fails fast with unknown placeholder when the process name cannot be determined', async () => {
    const log = vi.fn();
    const exit = vi.fn();

    await ensurePortAvailable(8788, {
      log,
      exit,
      checkPortOccupied: async () => true,
      killPortProcess: async () => ({ killed: false, pid: null, name: null, reason: 'no-pid' }),
    });

    expect(exit).toHaveBeenCalled();
    const messages = log.mock.calls.map((c) => c.join(' '));
    expect(messages.some((m) => m.includes('PID ?'))).toBe(true);
    expect(messages.some((m) => m.includes('process: unknown'))).toBe(true);
  });
});
