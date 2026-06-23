#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX_TOTAL_PCT = 1.0;

const run =
  process.platform === 'win32'
    ? spawnSync(
        'cmd.exe',
        ['/d', '/s', '/c', 'pnpm exec jscpd public/js --reporters json --silent'],
        {
          stdio: 'inherit',
          shell: false,
        }
      )
    : spawnSync('pnpm', ['exec', 'jscpd', 'public/js', '--reporters', 'json', '--silent'], {
        stdio: 'inherit',
        shell: false,
      });
if (run.status !== 0 && run.status !== 1) {
  // jscpd exits with code 1 when duplicates exceed threshold — that's expected.
  // Only propagate truly unexpected errors (e.g., missing config).
  console.error(`jscpd exited with unexpected code ${run.status}`);
  process.exit(run.status ?? 1);
}

const report = JSON.parse(readFileSync('report/jscpd-report.json', 'utf8'));
const totalPct = Number(report?.statistics?.total?.percentage || 0);

if (totalPct > MAX_TOTAL_PCT) {
  console.error(
    `jscpd budget exceeded: total ${totalPct.toFixed(2)}% > ${MAX_TOTAL_PCT.toFixed(2)}%`
  );
  process.exit(1);
}

console.log(
  `jscpd budgets passed — total: ${totalPct.toFixed(2)}% <= ${MAX_TOTAL_PCT.toFixed(2)}%`
);
