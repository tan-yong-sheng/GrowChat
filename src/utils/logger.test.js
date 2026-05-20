import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLogger,
  createRootLogger,
  resolveLogLevel,
  reconfigureAllRootLoggers,
} from './logger.js';

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

  describe('emit safety - code review fixes', () => {
    it('should not crash on circular references in data', () => {
      const logger = createLogger({ LOG_LEVEL: 'info' });
      const circular = {};
      circular.self = circular;
      // Must not throw
      expect(() => logger.info('Circular test', circular)).not.toThrow();
      // Should still emit a log entry (fallback goes to console.error)
      expect(consoleSpies.error).toHaveBeenCalled();
      const fallbackParsed = JSON.parse(consoleSpies.error.mock.calls[0][0]);
      expect(fallbackParsed.message).toBe('Circular test');
      expect(fallbackParsed.error).toBe('Logger serialization failed');
    });

    it('should not allow data keys to overwrite core metadata (level, timestamp)', () => {
      const logger = createLogger({ LOG_LEVEL: 'info' });
      logger.info('Metadata test', { level: 'critical', timestamp: 'fake' });
      const parsed = JSON.parse(consoleSpies.info.mock.calls[0][0]);
      expect(parsed.level).toBe('info'); // not 'critical'
      expect(parsed.timestamp).not.toBe('fake');
    });

    it('should wrap array data in a data key instead of spreading indexed keys', () => {
      const logger = createLogger({ LOG_LEVEL: 'info' });
      logger.info('Array test', ['item1', 'item2']);
      const parsed = JSON.parse(consoleSpies.info.mock.calls[0][0]);
      expect(parsed.message).toBe('Array test');
      expect(parsed.data).toEqual(['item1', 'item2']);
      expect(parsed).not.toHaveProperty('0');
      expect(parsed).not.toHaveProperty('1');
    });

    it('should wrap non-object data in a data key', () => {
      const logger = createLogger({ LOG_LEVEL: 'info' });
      logger.info('String data', 'just a string');
      const parsed = JSON.parse(consoleSpies.info.mock.calls[0][0]);
      expect(parsed.message).toBe('String data'); // message always wins
      expect(parsed.data).toBe('just a string');
    });
  });

  describe('reconfigure - code review fix', () => {
    it('should update log level when reconfigure is called with new env', () => {
      const logger = createRootLogger({}); // defaults to 'info'
      expect(logger.level).toBe('info');

      logger.debug('should be filtered');
      expect(consoleSpies.debug).not.toHaveBeenCalled();

      // Reconfigure with env that has LOG_LEVEL=debug
      logger.reconfigure({ LOG_LEVEL: 'debug' });
      expect(logger.level).toBe('debug');

      logger.debug('should now pass');
      expect(consoleSpies.debug).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleSpies.debug.mock.calls[0][0]);
      expect(parsed.message).toBe('should now pass');
    });

    it('should suppress logs after reconfiguring to a higher level', () => {
      const logger = createRootLogger({ LOG_LEVEL: 'debug' });
      logger.debug('passes at debug');
      expect(consoleSpies.debug).toHaveBeenCalledTimes(1);

      logger.reconfigure({ LOG_LEVEL: 'error' });
      expect(logger.level).toBe('error');

      logger.info('should be filtered');
      logger.warn('should be filtered');
      expect(consoleSpies.info).not.toHaveBeenCalled();
      expect(consoleSpies.warn).not.toHaveBeenCalled();

      logger.error('should pass');
      expect(consoleSpies.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconfigureAllRootLoggers', () => {
    it('should reconfigure all root loggers at once', () => {
      const logger1 = createRootLogger({}); // defaults to 'info'
      const logger2 = createRootLogger({}); // defaults to 'info'
      expect(logger1.level).toBe('info');
      expect(logger2.level).toBe('info');

      reconfigureAllRootLoggers({ LOG_LEVEL: 'debug' });
      expect(logger1.level).toBe('debug');
      expect(logger2.level).toBe('debug');

      logger1.debug('should pass now');
      expect(consoleSpies.debug).toHaveBeenCalledTimes(1);
    });
  });

  describe('child() after reconfigure', () => {
    it('should use updated env after reconfigure, not stale original', () => {
      const logger = createRootLogger({}); // defaults to 'info'
      logger.reconfigure({ LOG_LEVEL: 'debug' });

      const child = logger.child({ userId: 'u-123' });
      expect(child.level).toBe('debug');

      child.debug('child debug msg');
      expect(consoleSpies.debug).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleSpies.debug.mock.calls[0][0]);
      expect(parsed.message).toBe('child debug msg');
      expect(parsed.userId).toBe('u-123');
    });
  });

  describe('requestId propagation', () => {
    it('should propagate requestId through all log levels', () => {
      const logger = createLogger({ LOG_LEVEL: 'debug' }, { requestId: 'test-req-id' });

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
