import { describe, expect, it } from 'vitest';
import { auditMigrationFiles } from './migration-audit.js';

describe('migration audit', () => {
  it('accepts a sequential migration list', () => {
    const report = auditMigrationFiles([
      '001_initial.sql',
      '002_add_users.sql',
      '003_add_chat_status.sql',
    ]);

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('flags duplicate prefixes', () => {
    const report = auditMigrationFiles([
      '001_initial.sql',
      '002_add_users.sql',
      '002_duplicate.sql',
      '004_add_messages.sql',
    ]);

    expect(report.ok).toBe(false);
    expect(report.errors.some((error) => error.includes('Duplicate migration prefix 002'))).toBe(true);
  });

  it('flags invalid filenames', () => {
    const report = auditMigrationFiles(['README.md', 'bad.sql']);

    expect(report.ok).toBe(false);
    expect(report.errors).toContain('Invalid migration filename: README.md');
  });
});
