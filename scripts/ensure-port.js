/**
 * Pre-flight: kills any process on the target port (likely a lingering dev server).
 * Default reads GROWCHAT_PORT env var, falls back to 8787.
 * Usage: node scripts/ensure-port.js [port]
 */

import { execSync } from 'child_process';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const PORT = args[0] || process.env.GROWCHAT_PORT || 8787;

try {
  const pidList = execSync(`lsof -ti:${PORT}`, { encoding: 'utf8' }).trim();
  if (!pidList) {
    process.exit(0);
  }

  const pids = pidList.split('\n').filter(Boolean);
  for (const pid of pids) {
    try {
      const comm = execSync(`ps -o comm= -p ${pid}`, { encoding: 'utf8' }).trim();
      console.log(`🔪  Killing "${comm}" (PID ${pid}) on port ${PORT}`);
      execSync(`kill -9 ${pid}`);
    } catch {
      // Already gone
    }
  }

  // Wait for OS to release the port
  execSync(`sleep 0.5`);
  console.log(`✅  Port ${PORT} is now free`);
} catch (err) {
  if (err.status === 1) {
    // lsof returned no results (port already free)
    process.exit(0);
  }
  // Unexpected error — assume port is free and continue
}

process.exit(0);
