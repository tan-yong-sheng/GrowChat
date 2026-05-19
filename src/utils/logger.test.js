import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, createRootLogger, resolveLogLevel } from './logger.js';

describe('logger.js - Structured JSON Logger', () => {
  let consoleSpies;

  beforeEach(() => {
    consoleSpies = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    Object.values(consoleSpies).forEach((spy) => spy.mockRestore());
  });

  describe('resolveLogLevel', () => {
    it('should return explicit LOG_LEVEL when set', () => {
      expect(resolveLogLevel({ LOG_LEVEL: 'debug' })).toBe('debug');
      expect(resolveLogLevel({ LOG_LEVEL: 'warn' })).toBe('warn');
      expect(resolveLogLevel({ LOG_LEVEL: 'error' })).toBe('error');
      expect(resolveLogLevel({ LOG_LEVEL: 'INFO' })).toBe('info');
    });

    it('should default to debug when ENVIRONMENT=dev', () => {
      expect(resolveLogLevel({ ENVIRONMENT: 'dev' })).toBe('debug');
      expect(resolveLogLevel({ ENVIRONMENT: 'development' })).toBe('debug');
    });

    it('should default to info when ENVIRONMENT is not dev', () => {
      expect(resolveLogLevel({ ENVIRONMENT: 'production' })).toBe('info');
      expect(resolveLogLevel({})).toBe('info');
      expect(resolveLogLevel()).toBe('info');
    });

    it('should prioritize LOG_LEVEL over ENVIRONMENT', () => {
      expect(resolveLogLevel({ LOG_LEVEL: 'error', ENVIRONMENT: 'dev' })).toBe('error');
    });
  });

  describe('createLogger', () => {
    it('should emit JSON log entries at the correct level', () => {
      const logger = createLogger({ LOG_LEVEL: 'debug' });

      logger.debug('test debug');
      logger.info('test info');
      logger.warn('test warn');
      logger.error('test error');

      expect(consoleSpies.debug).toHaveBeenCalledTimes(1);
      expect(consoleSpies.info).toHaveBeenCalledTimes(1);
      expect(consoleSpies.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpies.error).toHaveBeenCalledTimes(1);
    });

    it('should filter logs below the configured level', () => {
      const logger = createLogger({ LOG_LEVEL: 'warn' });

      logger.debug('should be filtered');
      logger.info('should be filtered');
      logger.warn('should pass');
      logger.error('should pass');

      expect(consoleSpies.debug).not.toHaveBeenCalled();
      expect(consoleSpies.info).not.toHaveBeenCalled();
      expect(consoleSpies.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpies.error).toHaveBeenCalledTimes(1);
    });

    it('should produce valid JSON log entries', () => {
      const logger = createLogger({ LOG_LEVEL: 'info' }, { requestId: 'req-123' });

      logger.info('Test message', { key: 'value' });

      expect(consoleSpies.info).toHaveBeenCalledTimes(1);
      const loggedJson = consoleSpies.info.mock.calls[0][0];
      const parsed = JSON.parse(loggedJson);

      expect(parsed).toMatchObject({
        level: 'info',
        message: 'Test message',
        requestId: 'req-123',
        key: 'value',
      });
      expect(parsed.timestamp).toBeDefined();
    });

    it('should include requestId and userId in log entries when provided', () => {
      const logger = createLogger(
        { LOG_LEVEL: 'info' },
        { requestId: 'abc-def', userId: 'user-789' }
      );

      logger.info('With context');

      const parsed = JSON.parse(consoleSpies.info.mock.calls[0][0]);
      expect(parsed.requestId).toBe('abc-def');
      expect(parsed.userId).toBe('user-789');
    });

    it('should not include requestId/userId when not provided', () => {
      const logger = createLogger({ LOG_LEVEL: 'info' });

      logger.info('No context');

      const parsed = JSON.parse(consoleSpies.info.mock.calls[0][0]);
      expect(parsed).not.toHaveProperty('requestId');
      expect(parsed).not.toHaveProperty('userId');
    });

    it('should merge additional data into log entries', () => {
      const logger = createLogger({ LOG_LEVEL: 'info' });

      logger.info('With data', { path: '/api/chats', duration_ms: 42 });

      const parsed = JSON.parse(consoleSpies.info.mock.calls[0][0]);
      expect(parsed.path).toBe('/api/chats');
      expect(parsed.duration_ms).toBe(42);
    });

    it('should expose the resolved level', () => {
      const logger = createLogger({ LOG_LEVEL: 'warn' });
      expect(logger.level).toBe('warn');
    });
  });

  describe('createLogger.child', () => {
    it('should create a child logger with merged context', () => {
      const parent = createLogger({ LOG_LEVEL: 'info' }, { requestId: 'parent-req' });
      const child = parent.child({ userId: 'user-123' });

      child.info('Child message');

      const parsed = JSON.parse(consoleSpies.info.mock.calls[0][0]);
      expect(parsed.requestId).toBe('parent-req');
      expect(parsed.userId).toBe('user-123');
    });

    it('should override parent context with child context', () => {
      const parent = createLogger({ LOG_LEVEL: 'info' }, { requestId: 'old' });
      const child = parent.child({ requestId: 'new' });

      child.info('Override test');

      const parsed = JSON.parse(consoleSpies.info.mock.calls[0][0]);
      expect(parsed.requestId).toBe('new');
    });
  });

  describe('createRootLogger', () => {
    it('should create a logger without request context', () => {
      const logger = createRootLogger({ LOG_LEVEL: 'info' });

      logger.info('Root message');

      const parsed = JSON.parse(consoleSpies.info.mock.calls[0][0]);
      expect(parsed).not.toHaveProperty('requestId');
      expect(parsed).not.toHaveProperty('userId');
      expect(parsed.message).toBe('Root message');
    });
  });

  describe('requestId propagation', () => {
    it('should propagate requestId through all log levels', () => {
      const logger = createLogger(
        { LOG_LEVEL: 'debug' },
        { requestId: 'test-req-id' }
      );

      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      for (const [spy, level] of [
        [consoleSpies.debug, 'debug'],
        [consoleSpies.info, 'info'],
        [consoleSpies.warn, 'warn'],
        [consoleSpies.error, 'error'],
      ]) {
        const parsed = JSON.parse(spy.mock.calls[0][0]);
        expect(parsed.requestId).toBe('test-req-id');
        expect(parsed.level).toBe(level);
      }
    });
  });
});
