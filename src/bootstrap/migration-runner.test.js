import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listMigrationFileNames } from './migration-runner.js';

describe('migration runner', () => {
  it('lists migration files in prefix order', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'growchat-migrations-'));
    await writeFile(path.join(dir, '002_add_users.sql'), '-- test');
    await writeFile(path.join(dir, '001_initial.sql'), '-- test');
    await writeFile(path.join(dir, '003_add_chat_status.sql'), '-- test');

    await expect(listMigrationFileNames(dir)).resolves.toEqual([
      '001_initial.sql',
      '002_add_users.sql',
      '003_add_chat_status.sql',
    ]);
  });

  it('rejects invalid migration filenames', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'growchat-migrations-invalid-'));
    await writeFile(path.join(dir, '001_initial.sql'), '-- test');
    await writeFile(path.join(dir, 'README.md'), '# test');

    await expect(listMigrationFileNames(dir)).rejects.toMatchObject({
      message: expect.stringContaining('Invalid migration files'),
      details: expect.arrayContaining([
        expect.stringContaining('Invalid migration filename: README.md'),
      ]),
    });
  });
});
