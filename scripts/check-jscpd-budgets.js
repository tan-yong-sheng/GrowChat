#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const budgets = {
  'features/chat': 14.0,
  shared: 7.5,
  'features/account': 6.5,
  'features/admin': 5.5,
  total: 4.5,
};

const run =
  process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npx jscpd public/js --reporters json --silent'], {
        stdio: 'inherit',
        shell: false,
      })
    : spawnSync('npx', ['jscpd', 'public/js', '--reporters', 'json', '--silent'], {
        stdio: 'inherit',
        shell: false,
      });
if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

const report = JSON.parse(readFileSync('report/jscpd-report.json', 'utf8'));
const sources = report?.statistics?.formats?.javascript?.sources || {};
const totalPct = Number(report?.statistics?.total?.percentage || 0);

const areaStats = {
  'features/chat': { dup: 0, lines: 0 },
  shared: { dup: 0, lines: 0 },
  'features/account': { dup: 0, lines: 0 },
  'features/admin': { dup: 0, lines: 0 },
};

const cwdPrefix = `${process.cwd().replaceAll('\\', '/')}/`;
for (const [absPath, stat] of Object.entries(sources)) {
  const normalized = String(absPath).replaceAll('\\', '/');
  const rel = normalized.startsWith(cwdPrefix) ? normalized.slice(cwdPrefix.length) : normalized;
  if (rel.startsWith('public/js/features/chat/')) {
    areaStats['features/chat'].dup += Number(stat.duplicatedLines || 0);
    areaStats['features/chat'].lines += Number(stat.lines || 0);
  } else if (rel.startsWith('public/js/shared/')) {
    areaStats.shared.dup += Number(stat.duplicatedLines || 0);
    areaStats.shared.lines += Number(stat.lines || 0);
  } else if (rel.startsWith('public/js/features/account/')) {
    areaStats['features/account'].dup += Number(stat.duplicatedLines || 0);
    areaStats['features/account'].lines += Number(stat.lines || 0);
  } else if (rel.startsWith('public/js/features/admin/')) {
    areaStats['features/admin'].dup += Number(stat.duplicatedLines || 0);
    areaStats['features/admin'].lines += Number(stat.lines || 0);
  }
}

const failures = [];
for (const [area, values] of Object.entries(areaStats)) {
  const pct = values.lines > 0 ? (values.dup / values.lines) * 100 : 0;
  if (pct > budgets[area]) {
    failures.push(`${area}: ${pct.toFixed(2)}% > ${budgets[area].toFixed(2)}%`);
  }
}
if (totalPct > budgets.total) {
  failures.push(`total: ${totalPct.toFixed(2)}% > ${budgets.total.toFixed(2)}%`);
}

if (failures.length) {
  console.error('jscpd budget exceeded:');
  failures.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

console.log('jscpd budgets passed');
console.log(`- total: ${totalPct.toFixed(2)}% <= ${budgets.total.toFixed(2)}%`);
for (const [area, values] of Object.entries(areaStats)) {
  const pct = values.lines > 0 ? (values.dup / values.lines) * 100 : 0;
  console.log(`- ${area}: ${pct.toFixed(2)}% <= ${budgets[area].toFixed(2)}%`);
}
