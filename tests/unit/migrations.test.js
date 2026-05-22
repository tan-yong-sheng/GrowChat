import { describe, it, expect } from 'vitest';
import { auditMigrationFiles } from '../../src/bootstrap/migration-audit.js';

describe('Migration Validation', () => {
  it('should pass for valid migration filenames', () => {
    const files = ['001_initial.sql', '002_add_user.sql'];
    const report = auditMigrationFiles(files);
    expect(report.ok).toBe(true);
  });

  it('should fail for duplicate migration prefixes', () => {
    const files = ['001_initial.sql', '001_other.sql'];
    const report = auditMigrationFiles(files);
    expect(report.ok).toBe(false);
    expect(report.errors[0]).toContain('Duplicate migration prefix 001');
  });

  it('should fail for invalid filename patterns', () => {
    const files = ['bad-name.sql'];
    const report = auditMigrationFiles(files);
    expect(report.ok).toBe(false);
    expect(report.errors[0]).toContain('Invalid migration filename');
  });
});
