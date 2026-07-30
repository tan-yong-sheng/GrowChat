/**
 * Pre-flight: kills any process on the target port (likely a lingering dev server).
 * Default reads GROWCHAT_PORT env var, falls back to 8787.
 * Usage: node scripts/ensure-port.js [port]
 */

import { execFileSync } from 'child_process';

/** Default port for the GrowChat dev server. Must match wrangler's --port. */
const DEFAULT_PORT = 8787;

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const rawPort = args[0] || process.env.GROWCHAT_PORT || DEFAULT_PORT;
// Defense against CodeQL shell-command-injection findings: reject anything
// that isn't a positive integer in [1, 65535] before passing to lsof. The
// regex also rejects strings like "8787; rm -rf /", negatives, decimals,
// and zero (port 0 isn't bindable for our purposes).
const portMatch = String(rawPort).match(
  /^([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$/
);
if (!portMatch) {
  console.warn(`⚠️  Invalid port "${rawPort}" — treating port as free.`);
  process.exit(0);
}
const PORT = Number(portMatch[1]);

try {
  const pidList = execFileSync('lsof', ['-t', '-i', `:${PORT}`], { encoding: 'utf8' }).trim();
  if (!pidList) {
    process.exit(0);
  }

  const pids = pidList.split('\n').filter(Boolean);
  for (const rawPid of pids) {
    // Defense in depth: validate the PID we just read from lsof before passing
    // it on to ps / kill. The original /^\d+$/ test allowed "0" through, and
    // `kill -9 0` would signal the entire process group (taking down the dev
    // server itself). Require a positive safe integer.
    const pid = Number(rawPid);
    if (!Number.isSafeInteger(pid) || pid <= 0) continue;
    const safePid = String(pid);
    try {
      const comm = execFileSync('ps', ['-o', 'comm=', '-p', safePid], { encoding: 'utf8' }).trim();
      console.log(`🔪  Killing "${comm}" (PID ${safePid}) on port ${PORT}`);
      execFileSync('kill', ['-9', safePid]);
    } catch {
      // Already gone
    }
  }

  // Wait for OS to release the port. execFileSync ignores the result; we just
  // need the wall-clock pause.
  execFileSync('sleep', ['0.5']);
  console.log(`✅  Port ${PORT} is now free`);
} catch (err) {
  if (err.status === 1) {
    // lsof returned no results (port already free)
    process.exit(0);
  }
  // Unexpected error — assume port is free and continue
}

process.exit(0);
