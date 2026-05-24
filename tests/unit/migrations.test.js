import { describe, it, expect } from 'vitest';
import {
  auditMigrationFiles,
  detectRemovedMigrations,
  scanDestructiveDDL,
} from '../../src/bootstrap/migration-audit.js';

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

describe('detectRemovedMigrations', () => {
  it('should pass when no files were removed', () => {
    const previous = ['001_initial.sql', '002_add_user.sql'];
    const current = ['001_initial.sql', '002_add_user.sql'];
    const report = detectRemovedMigrations(current, previous);
    expect(report.ok).toBe(true);
    expect(report.removed).toHaveLength(0);
    expect(report.renamed).toHaveLength(0);
  });

  it('should detect removed migration files', () => {
    const previous = ['001_initial.sql', '002_add_user.sql', '003_add_index.sql'];
    const current = ['001_initial.sql', '002_add_user.sql'];
    const report = detectRemovedMigrations(current, previous);
    expect(report.ok).toBe(false);
    expect(report.removed).toContain('003_add_index.sql');
    expect(report.errors[0]).toContain('Removed migration file detected');
  });

  it('should detect renamed migration files', () => {
    const previous = ['001_initial.sql', '002_add_user.sql'];
    const current = ['001_initial.sql', '002_rename_user.sql'];
    const report = detectRemovedMigrations(current, previous);
    expect(report.ok).toBe(false);
    expect(report.renamed).toHaveLength(1);
    expect(report.renamed[0]).toEqual({ from: '002_add_user.sql', to: '002_rename_user.sql' });
    expect(report.errors[0]).toContain('Renamed migration file detected');
  });

  it('should not flag newly added files', () => {
    const previous = ['001_initial.sql'];
    const current = ['001_initial.sql', '002_add_user.sql'];
    const report = detectRemovedMigrations(current, previous);
    expect(report.ok).toBe(true);
    expect(report.removed).toHaveLength(0);
  });

  it('should handle empty previous list', () => {
    const current = ['001_initial.sql'];
    const report = detectRemovedMigrations(current, []);
    expect(report.ok).toBe(true);
  });
});

describe('scanDestructiveDDL', () => {
  it('should pass for safe SQL content', () => {
    const fileContents = {
      '001_initial.sql': 'CREATE TABLE users (id INTEGER PRIMARY KEY);',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(0);
  });

  it('should warn on DROP TABLE', () => {
    const fileContents = {
      '004_drop_old.sql': 'DROP TABLE old_table;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(false);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0].description).toContain('DROP TABLE');
    expect(report.warnings[0].file).toBe('004_drop_old.sql');
    expect(report.warnings[0].line).toBe(1);
  });

  it('should warn on DROP COLUMN', () => {
    const fileContents = {
      '005_alter.sql': 'ALTER TABLE users DROP COLUMN middle_name;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(false);
    expect(report.warnings.length).toBeGreaterThanOrEqual(1);
    const hasDropColumn = report.warnings.some((w) => w.description.includes('DROP COLUMN'));
    expect(hasDropColumn).toBe(true);
  });

  it('should warn on RENAME TABLE', () => {
    const fileContents = {
      '006_rename.sql': 'RENAME TABLE users TO accounts;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(false);
    expect(report.warnings.some((w) => w.description.includes('RENAME TABLE'))).toBe(true);
  });

  it('should skip comment-only lines', () => {
    const fileContents = {
      '007_comment.sql': '-- DROP TABLE old_table;\nCREATE INDEX idx_name ON users(name);',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(true);
  });

  it('should handle multiple files and multiple patterns', () => {
    const fileContents = {
      '008_multi.sql': 'DROP TABLE temp;\nALTER TABLE users DROP COLUMN age;',
      '009_second.sql': 'DROP INDEX old_idx;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(false);
    expect(report.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle empty content map', () => {
    const report = scanDestructiveDDL({});
    expect(report.ok).toBe(true);
  });

  it('should ignore destructive keywords inside block comments', () => {
    const fileContents = {
      '010_block_comment.sql':
        '/* DROP TABLE old_table; */\nCREATE TABLE users (id INTEGER PRIMARY KEY);',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(0);
  });

  it('should ignore inline comments after code on the same line', () => {
    const fileContents = {
      '011_inline_after_code.sql': 'CREATE TABLE t (id INTEGER); -- DROP TABLE t;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(true);
  });

  it('should detect destructive DDL in multiline statements', () => {
    const fileContents = {
      '012_multiline.sql': 'ALTER TABLE\n  users\n  DROP COLUMN age;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(false);
    expect(report.warnings.some((w) => w.description.includes('DROP COLUMN'))).toBe(true);
    // Line should point to the start of the statement
    expect(report.warnings[0].line).toBe(1);
  });

  it('should detect destructive DDL with quoted identifiers', () => {
    const fileContents = {
      '013_quoted.sql': 'ALTER TABLE "users" DROP COLUMN middle_name;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(false);
    expect(report.warnings.some((w) => w.description.includes('DROP COLUMN'))).toBe(true);
  });

  it('should detect destructive DDL with schema-qualified names', () => {
    const fileContents = {
      '014_schema_qualified.sql': 'ALTER TABLE public.users DROP COLUMN age;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(false);
    expect(report.warnings.some((w) => w.description.includes('DROP COLUMN'))).toBe(true);
  });

  it('should ignore multi-line block comments', () => {
    const fileContents = {
      '015_multiline_comment.sql':
        '/* This migration\n   DROP TABLE old_data;\n   was already applied */\nCREATE TABLE new_data (id INTEGER);',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(true);
  });

  it('should ignore destructive keywords inside string literals', () => {
    const fileContents = {
      '016_string_literal.sql': "INSERT INTO logs (msg) VALUES ('DROP TABLE users;');",
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(0);
  });

  it('should ignore destructive keywords inside quoted identifiers', () => {
    const fileContents = {
      '017_quoted_identifier.sql': 'CREATE TABLE "DROP TABLE" (id INTEGER PRIMARY KEY);',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(0);
  });

  it('should skip DROP TABLE IF EXISTS (guarded statement)', () => {
    const fileContents = {
      '018_guarded_drop.sql': 'DROP TABLE IF EXISTS old_data;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(0);
  });

  it('should skip DROP INDEX IF EXISTS (guarded statement)', () => {
    const fileContents = {
      '019_guarded_index.sql': 'DROP INDEX IF EXISTS old_idx;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(0);
  });

  it('should warn on unguarded DROP TABLE', () => {
    const fileContents = {
      '020_unguarded_drop.sql': 'DROP TABLE old_data;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(false);
    expect(report.warnings.some((w) => w.description.includes('DROP TABLE'))).toBe(true);
  });

  it('should detect ALTER TABLE RENAME TO (SQLite/D1 syntax)', () => {
    const fileContents = {
      '021_sqlite_rename.sql': 'ALTER TABLE users RENAME TO accounts;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(false);
    expect(report.warnings.some((w) => w.description.includes('RENAME TO'))).toBe(true);
  });

  it('should skip ALTER TABLE RENAME TO IF EXISTS (guarded)', () => {
    const fileContents = {
      '022_guarded_rename.sql': 'ALTER TABLE IF EXISTS users RENAME TO accounts;',
    };
    const report = scanDestructiveDDL(fileContents);
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(0);
  });
});
