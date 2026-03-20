#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_ROUTES } from '../src/bootstrap/router-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../docs/api');
const outFile = path.join(outDir, 'public-routes.md');

const rows = PUBLIC_ROUTES.map((route) => {
  const routePath = route.path instanceof RegExp ? route.path.toString() : route.path;
  return `| ${route.method} | ${routePath} | ${route.description} |`;
});

const content = [
  '# Public API Routes',
  '',
  'Generated from `src/bootstrap/router-registry.js`.',
  '',
  '| Method | Path | Description |',
  '| --- | --- | --- |',
  ...rows,
  '',
].join('\n');

await mkdir(outDir, { recursive: true });
await writeFile(outFile, content, 'utf8');
console.log(`Wrote ${path.relative(process.cwd(), outFile)}`);
