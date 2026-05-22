#!/usr/bin/env node
import { rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function cleanupSnapshots(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === '__snapshots__') {
        console.log(`Removing ${join(dir, entry.name)}`);
        await rm(join(dir, entry.name), { recursive: true, force: true });
      } else {
        await cleanupSnapshots(join(dir, entry.name));
      }
    }
  }
}

try {
  await cleanupSnapshots('./tests/e2e');
  console.log('Snapshot cleanup complete.');
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
  console.log('No snapshot directories found. Nothing to clean.');
}
