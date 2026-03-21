import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureSchemaCompatibility, resetSchemaCompatibilityState } from './schema-compatibility.js';

function createStatement(sql, dbState) {
  return {
    bind: (...params) => createBoundStatement(sql, params, dbState),
    all: async () => createAllResult(sql, [], dbState),
    run: async () => createRunResult(sql, [], dbState),
  };
}

function createBoundStatement(sql, params, dbState) {
  return {
    sql,
    params,
    all: async () => createAllResult(sql, params, dbState),
    run: async () => createRunResult(sql, params, dbState),
  };
}

function createAllResult(sql, params, dbState) {
  const text = String(sql || '');
  dbState.allQueries.push({ sql: text, params });

  if (text.includes('PRAGMA table_info(messages)')) {
    return { results: dbState.messagesColumns };
  }
  if (text.includes('PRAGMA table_info(users)')) {
    return { results: dbState.usersColumns };
  }
  if (text.includes("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?)")) {
    return { results: dbState.coreTables };
  }
  if (text.includes("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?, ?)")) {
    return { results: dbState.rbacTables };
  }
  return { results: [] };
}

function createRunResult(sql, params, dbState) {
  const text = String(sql || '');
  dbState.runQueries.push({ sql: text, params });
  return { success: true };
}

function createDb(dbState) {
  return {
    prepare: vi.fn((sql) => createStatement(sql, dbState)),
  };
}

describe('ensureSchemaCompatibility', () => {
  beforeEach(() => {
    resetSchemaCompatibilityState();
  });

  it('adds missing columns and updates user defaults', async () => {
    const dbState = {
      allQueries: [],
      runQueries: [],
      messagesColumns: [{ name: 'id' }],
      usersColumns: [{ name: 'id' }, { name: 'created_at' }, { name: 'updated_at' }],
      coreTables: [
        { name: 'users' },
        { name: 'chats' },
        { name: 'messages' },
        { name: 'refresh_tokens' },
      ],
      rbacTables: [
        { name: 'roles' },
        { name: 'permissions' },
        { name: 'role_permissions' },
        { name: 'user_roles' },
        { name: 'audit_log' },
      ],
    };
    const env = { DB: createDb(dbState) };
    const warnings = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => warnings.push(args));

    try {
      await ensureSchemaCompatibility(env);
    } finally {
      warnSpy.mockRestore();
    }

    expect(dbState.runQueries.map((entry) => entry.sql)).toEqual([
      'ALTER TABLE messages ADD COLUMN citations TEXT',
      'ALTER TABLE users ADD COLUMN last_active_at INTEGER',
      'ALTER TABLE users ADD COLUMN avatar TEXT',
      'ALTER TABLE users ADD COLUMN avatar_emoji TEXT',
      "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'offline'",
      "ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}'",
      'UPDATE users SET last_active_at = COALESCE(updated_at, created_at) WHERE last_active_at IS NULL',
      "UPDATE users SET status = 'offline' WHERE status IS NULL",
      "UPDATE users SET preferences = '{}' WHERE preferences IS NULL",
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(warnings).toHaveLength(0);
  });

  it('logs missing table diagnostics once and memoizes the work', async () => {
    const dbState = {
      allQueries: [],
      runQueries: [],
      messagesColumns: [{ name: 'citations' }],
      usersColumns: [{ name: 'id' }, { name: 'created_at' }, { name: 'updated_at' }],
      coreTables: [{ name: 'users' }, { name: 'messages' }],
      rbacTables: [{ name: 'roles' }, { name: 'permissions' }],
    };
    const env = { DB: createDb(dbState) };
    const warnings = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => warnings.push(args));

    try {
      await ensureSchemaCompatibility(env);
      await ensureSchemaCompatibility(env);
    } finally {
      warnSpy.mockRestore();
    }

    expect(warnings.map((call) => String(call[0]))).toEqual([
      'Core schema missing tables [chats, refresh_tokens]. Run: wrangler d1 execute growchat --local --file=./migrations/001_initial.sql',
      'RBAC schema missing tables [role_permissions, user_roles, audit_log]. Run: wrangler d1 execute growchat --local --file=./migrations/010_rbac_core.sql',
    ]);
    expect(dbState.allQueries.filter((entry) => String(entry.sql).includes('sqlite_master'))).toHaveLength(2);
  });
});
