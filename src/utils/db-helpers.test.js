import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chunkedBatch } from './db-helpers.js';

describe('db-helpers.js', () => {
  let db;

  beforeEach(() => {
    db = {
      batch: vi.fn(),
    };
  });

  describe('chunkedBatch', () => {
    it('should execute a single batch when statements are within the chunk size', async () => {
      const statements = Array.from({ length: 50 }, (_, i) => ({ id: i }));
      const expected = statements.map((s) => ({ success: true, id: s.id }));
      db.batch.mockResolvedValue(expected);

      const result = await chunkedBatch(db, statements);

      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(db.batch).toHaveBeenCalledWith(statements);
      expect(result).toEqual(expected);
    });

    it('should split statements into chunks of 100 by default (250 -> 3 calls)', async () => {
      const statements = Array.from({ length: 250 }, (_, i) => ({ id: i }));
      let callIndex = 0;
      db.batch.mockImplementation((chunk) => {
        return Promise.resolve(chunk.map((s) => ({ id: s.id, chunk: callIndex++ })));
      });

      const result = await chunkedBatch(db, statements);

      expect(db.batch).toHaveBeenCalledTimes(3);
      expect(db.batch.mock.calls[0][0].length).toBe(100);
      expect(db.batch.mock.calls[1][0].length).toBe(100);
      expect(db.batch.mock.calls[2][0].length).toBe(50);
      expect(result).toHaveLength(250);
    });

    it('should support a custom chunk size', async () => {
      const statements = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      db.batch.mockResolvedValue([{ success: true }]);

      await chunkedBatch(db, statements, 10);

      expect(db.batch).toHaveBeenCalledTimes(3);
      expect(db.batch.mock.calls[0][0].length).toBe(10);
      expect(db.batch.mock.calls[1][0].length).toBe(10);
      expect(db.batch.mock.calls[2][0].length).toBe(5);
    });

    it('should return an empty array for no statements', async () => {
      const result = await chunkedBatch(db, []);

      expect(db.batch).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should tolerate db.batch returning undefined', async () => {
      const statements = Array.from({ length: 5 }, (_, i) => ({ id: i }));
      db.batch.mockResolvedValue(undefined);

      const result = await chunkedBatch(db, statements);

      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]);
    });

    it('should preserve atomicity at the boundary: 100 statements = 1 batch call (#125)', async () => {
      const statements = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      db.batch.mockResolvedValue(statements.map((s) => ({ id: s.id })));

      const result = await chunkedBatch(db, statements);

      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(db.batch).toHaveBeenCalledWith(statements);
      expect(result).toHaveLength(100);
    });

    it('should chunk exactly at the boundary: 101 statements = 2 batch calls (#125)', async () => {
      const statements = Array.from({ length: 101 }, (_, i) => ({ id: i }));
      let callIndex = 0;
      db.batch.mockImplementation((chunk) => {
        return Promise.resolve(chunk.map((s) => ({ id: s.id, chunk: callIndex++ })));
      });

      const result = await chunkedBatch(db, statements);

      expect(db.batch).toHaveBeenCalledTimes(2);
      expect(db.batch.mock.calls[0][0]).toHaveLength(100);
      expect(db.batch.mock.calls[1][0]).toHaveLength(1);
      expect(result).toHaveLength(101);
    });
  });
});
