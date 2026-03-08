import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DB, createDB } from './db.js';

describe('db.js - Database Abstraction', () => {
  let mockD1;
  let db;

  // Helper to create a mock statement that returns itself from bind()
  const createMockStatement = (overrides = {}) => {
    const mockStatement = { bind: vi.fn(), ...overrides };
    mockStatement.bind.mockReturnValue(mockStatement);
    return mockStatement;
  };

  beforeEach(() => {
    mockD1 = {
      prepare: vi.fn(),
      batch: vi.fn(),
    };
    db = new DB(mockD1);
  });

  describe('DB Constructor', () => {
    it('should create a DB instance with d1 binding', () => {
      expect(db.d1).toBe(mockD1);
    });
  });

  describe('prepare method', () => {
    it('should call d1.prepare with SQL', () => {
      const sql = 'SELECT * FROM users';
      const mockStatement = { bind: vi.fn() };
      mockD1.prepare.mockReturnValue(mockStatement);

      db.prepare(sql);

      expect(mockD1.prepare).toHaveBeenCalledWith(sql);
    });

    it('should bind parameters when provided', () => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const params = ['123'];
      const mockStatement = { bind: vi.fn().mockReturnValue('bound') };
      mockD1.prepare.mockReturnValue(mockStatement);

      db.prepare(sql, params);

      expect(mockStatement.bind).toHaveBeenCalledWith(...params);
    });

    it('should not bind when no parameters', () => {
      const sql = 'SELECT * FROM users';
      const mockStatement = { bind: vi.fn() };
      mockD1.prepare.mockReturnValue(mockStatement);

      db.prepare(sql, []);

      expect(mockStatement.bind).not.toHaveBeenCalled();
    });

    it('should handle multiple parameters', () => {
      const sql = 'INSERT INTO users (email, name, role) VALUES (?, ?, ?)';
      const params = ['user@example.com', 'John Doe', 'admin'];
      const mockStatement = { bind: vi.fn() };
      mockD1.prepare.mockReturnValue(mockStatement);

      db.prepare(sql, params);

      expect(mockStatement.bind).toHaveBeenCalledWith(...params);
    });
  });

  describe('run method', () => {
    it('should execute a statement with no parameters', async () => {
      const sql = 'DELETE FROM temp_table';
      const mockStatement = { run: vi.fn().mockResolvedValue({ success: true }) };
      mockD1.prepare.mockReturnValue(mockStatement);

      const result = await db.run(sql);

      expect(mockD1.prepare).toHaveBeenCalledWith(sql);
      expect(mockStatement.run).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should execute a statement with parameters', async () => {
      const sql = 'DELETE FROM users WHERE id = ?';
      const params = ['user-123'];
      const mockStatement = createMockStatement({ run: vi.fn().mockResolvedValue({ changes: 1 }) });
      mockD1.prepare.mockReturnValue(mockStatement);

      const result = await db.run(sql, params);

      expect(mockStatement.bind).toHaveBeenCalledWith('user-123');
      expect(mockStatement.run).toHaveBeenCalled();
      expect(result).toEqual({ changes: 1 });
    });

    it('should handle INSERT operations', async () => {
      const sql = 'INSERT INTO users (id, email) VALUES (?, ?)';
      const params = ['123', 'new@example.com'];
      const mockStatement = createMockStatement({ run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }) });
      mockD1.prepare.mockReturnValue(mockStatement);

      const result = await db.run(sql, params);

      expect(mockStatement.bind).toHaveBeenCalledWith(...params);
      expect(result).toBeTruthy();
    });

    it('should handle UPDATE operations', async () => {
      const sql = 'UPDATE users SET name = ? WHERE id = ?';
      const params = ['John', 'user-123'];
      const mockStatement = createMockStatement({ run: vi.fn().mockResolvedValue({ changes: 1 }) });
      mockD1.prepare.mockReturnValue(mockStatement);

      const result = await db.run(sql, params);

      expect(result).toBeTruthy();
    });
  });

  describe('first method', () => {
    it('should return first row from query result', async () => {
      const sql = 'SELECT * FROM users WHERE email = ?';
      const params = ['test@example.com'];
      const expectedRow = { id: '123', email: 'test@example.com', name: 'Test User' };
      const mockStatement = createMockStatement({ first: vi.fn().mockResolvedValue(expectedRow) });
      mockD1.prepare.mockReturnValue(mockStatement);

      const result = await db.first(sql, params);

      expect(mockStatement.bind).toHaveBeenCalledWith('test@example.com');
      expect(mockStatement.first).toHaveBeenCalled();
      expect(result).toEqual(expectedRow);
    });

    it('should return null when no rows found', async () => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const params = ['nonexistent'];
      const mockStatement = createMockStatement({ first: vi.fn().mockResolvedValue(null) });
      mockD1.prepare.mockReturnValue(mockStatement);

      const result = await db.first(sql, params);

      expect(result).toBeNull();
    });

    it('should work without parameters', async () => {
      const sql = 'SELECT COUNT(*) as count FROM users';
      const expectedRow = { count: 42 };
      const mockStatement = { first: vi.fn().mockResolvedValue(expectedRow) };
      mockD1.prepare.mockReturnValue(mockStatement);

      const result = await db.first(sql, []);

      expect(result).toEqual(expectedRow);
    });
  });

  describe('all method', () => {
    it('should return array of rows', async () => {
      const sql = 'SELECT * FROM users';
      const expectedRows = [
        { id: '1', email: 'user1@example.com' },
        { id: '2', email: 'user2@example.com' },
      ];
      const mockStatement = { all: vi.fn().mockResolvedValue({ results: expectedRows }) };
      mockD1.prepare.mockReturnValue(mockStatement);

      const result = await db.all(sql, []);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(expectedRows);
    });

    it('should return empty array when no rows found', async () => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const params = ['nonexistent'];
      const mockStatement = createMockStatement({ all: vi.fn().mockResolvedValue({ results: [] }) });
      mockD1.prepare.mockReturnValue(mockStatement);

      const result = await db.all(sql, params);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });

    it('should handle result without results property', async () => {
      const sql = 'SELECT * FROM empty_table';
      const mockStatement = { all: vi.fn().mockResolvedValue({}) };
      mockD1.prepare.mockReturnValue(mockStatement);

      const result = await db.all(sql, []);

      expect(result).toEqual([]);
    });

    it('should work with parameterized queries', async () => {
      const sql = 'SELECT * FROM chats WHERE user_id = ?';
      const params = ['user-123'];
      const expectedRows = [
        { id: 'chat1', title: 'Chat 1', user_id: 'user-123' },
        { id: 'chat2', title: 'Chat 2', user_id: 'user-123' },
      ];
      const mockStatement = {
        bind: vi.fn(),
        all: vi.fn().mockResolvedValue({ results: expectedRows })
      };
      mockStatement.bind.mockReturnValue(mockStatement);
      mockD1.prepare.mockReturnValue(mockStatement);

      const result = await db.all(sql, params);

      expect(mockStatement.bind).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(expectedRows);
    });

    it('should handle large result sets', async () => {
      const sql = 'SELECT * FROM messages';
      const largeResultSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `msg-${i}`,
        content: `Message ${i}`,
      }));
      const mockStatement = { all: vi.fn().mockResolvedValue({ results: largeResultSet }) };
      mockD1.prepare.mockReturnValue(mockStatement);

      const result = await db.all(sql, []);

      expect(result.length).toBe(1000);
    });
  });

  describe('batch method', () => {
    it('should execute batch of statements', async () => {
      const statements = [
        { sql: 'INSERT INTO users VALUES (?, ?)', params: ['1', 'user1@example.com'] },
        { sql: 'INSERT INTO users VALUES (?, ?)', params: ['2', 'user2@example.com'] },
      ];
      const expectedResult = [{ success: true }, { success: true }];
      mockD1.batch.mockResolvedValue(expectedResult);

      const result = await db.batch(statements);

      expect(mockD1.batch).toHaveBeenCalledWith(statements);
      expect(result).toEqual(expectedResult);
    });

    it('should handle empty batch', async () => {
      mockD1.batch.mockResolvedValue([]);

      const result = await db.batch([]);

      expect(result).toEqual([]);
    });

    it('should handle single statement batch', async () => {
      const statements = [{ sql: 'DELETE FROM temp', params: [] }];
      mockD1.batch.mockResolvedValue([{ success: true }]);

      const result = await db.batch(statements);

      expect(mockD1.batch).toHaveBeenCalledWith(statements);
      expect(result.length).toBe(1);
    });
  });

  describe('createDB factory', () => {
    it('should create a DB instance', () => {
      const instance = createDB(mockD1);

      expect(instance).toBeInstanceOf(DB);
      expect(instance.d1).toBe(mockD1);
    });

    it('should create independent instances', () => {
      const instance1 = createDB(mockD1);
      const instance2 = createDB(mockD1);

      expect(instance1).not.toBe(instance2);
      expect(instance1.d1).toBe(instance2.d1);
    });
  });
});
