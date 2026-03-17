import { describe, it, expect, beforeEach, vi } from 'vitest';
import { streamLLM, SseLineParser, parseSseChunk } from './llm.js';

describe('llm.js - LLM Streaming', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      OPENAI_BASE_URL: 'https://api.example.com/v1',
      OPENAI_API_KEY: 'test-key-12345',
    };
  });

  describe('streamLLM', () => {
    it('should throw when model is not provided', async () => {
      await expect(streamLLM(mockEnv, '', [])).rejects.toThrow('Model is required');
      await expect(streamLLM(mockEnv, null, [])).rejects.toThrow('Model is required');
      await expect(streamLLM(mockEnv, undefined, [])).rejects.toThrow('Model is required');
    });

    it('should reject Workers AI models', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      await expect(streamLLM(mockEnv, '@cf/meta/llama-2-7b', messages)).rejects.toThrow(
        'Workers AI models are disabled'
      );
    });

    it('should use OpenAI-compatible API for non-@cf/ models', async () => {
      global.fetch = vi.fn();
      const mockStream = {
        ok: true,
        body: 'response body',
      };
      global.fetch.mockResolvedValue(mockStream);

      const messages = [{ role: 'user', content: 'Test' }];
      const result = await streamLLM(mockEnv, 'gpt-4', messages);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key-12345',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toBe('response body');
    });

    it('should throw when no provider connection is configured', async () => {
      global.fetch = vi.fn();
      mockEnv.OPENAI_API_KEY = '';
      mockEnv.OPENAI_BASE_URL = '';

      await expect(streamLLM(mockEnv, 'gpt-4', [])).rejects.toThrow('No provider connection configured');
    });

    it('should handle OpenAI response errors', async () => {
      global.fetch = vi.fn();
      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(streamLLM(mockEnv, 'gpt-4', [])).rejects.toThrow('LLM request failed (401)');
    });

    it('should handle missing response body', async () => {
      global.fetch = vi.fn();
      global.fetch.mockResolvedValue({
        ok: true,
        body: null,
        text: async () => '',
      });

      await expect(streamLLM(mockEnv, 'gpt-4', [])).rejects.toThrow('LLM request failed');
    });

    it('should normalize OPENAI_BASE_URL by removing trailing slash', async () => {
      global.fetch = vi.fn();
      mockEnv.OPENAI_BASE_URL = 'https://api.example.com/v1/';
      global.fetch.mockResolvedValue({ ok: true, body: 'stream' });

      await streamLLM(mockEnv, 'gpt-4', []);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/chat/completions',
        expect.any(Object)
      );
    });

    it('should handle fetch network errors', async () => {
      global.fetch = vi.fn();
      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(streamLLM(mockEnv, 'gpt-4', [])).rejects.toThrow();
    });

    it('should pass messages array to LLM', async () => {
      global.fetch = vi.fn();
      global.fetch.mockResolvedValue({ ok: true, body: 'stream' });

      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];
      await streamLLM(mockEnv, 'gpt-4', messages);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(JSON.stringify(messages)),
        })
      );
    });
  });

  describe('SseLineParser', () => {
    let parser;

    beforeEach(() => {
      parser = new SseLineParser();
    });

    describe('push', () => {
      it('should parse complete SSE line with JSON payload', () => {
        const text = 'data: {"response":"Hello"}\n\n';
        const result = parser.push(text);

        expect(result).toBe('Hello');
      });

      it('should extract content from OpenAI delta format', () => {
        const text = 'data: {"choices":[{"delta":{"content":"world"}}]}\n\n';
        const result = parser.push(text);

        expect(result).toBe('world');
      });

      it('should ignore [DONE] marker', () => {
        const text = 'data: [DONE]\n\n';
        const result = parser.push(text);

        expect(result).toBe('');
      });

      it('should buffer incomplete JSON across chunks', () => {
        const chunk1 = 'data: {"response":"Hel';
        const chunk2 = 'lo"}\n\n';

        const result1 = parser.push(chunk1);
        const result2 = parser.push(chunk2);

        expect(result1).toBe('');
        expect(result2).toBe('Hello');
      });

      it('should handle multiple SSE lines in single push', () => {
        const text = 'data: {"response":"Line1"}\ndata: {"response":"Line2"}\n\n';
        const result = parser.push(text);

        expect(result).toContain('Line1');
        expect(result).toContain('Line2');
      });

      it('should skip malformed JSON lines', () => {
        const text = 'data: {invalid json}\ndata: {"response":"valid"}\n\n';
        const result = parser.push(text);

        expect(result).toBe('valid');
      });

      it('should handle lines without data: prefix', () => {
        const text = 'event: start\ndata: {"response":"Hello"}\n\n';
        const result = parser.push(text);

        expect(result).toBe('Hello');
      });

      it('should preserve carriage returns and line endings', () => {
        const text = 'data: {"response":"test"}\r\n\n';
        const result = parser.push(text);

        expect(result).toBe('test');
      });

      it('should handle empty response field', () => {
        const text = 'data: {"response":""}\n\n';
        const result = parser.push(text);

        expect(result).toBe('');
      });

      it('should accumulate text from multiple pushes', () => {
        parser.push('data: {"response":"Hello"}\n\n');
        const result1 = parser.push('data: {"response":" "}\n\n');
        const result2 = parser.push('data: {"response":"world"}\n\n');

        expect(result1 + result2).toBe(' world');
      });

      it('should handle whitespace in data field', () => {
        const text = 'data: {"response":"  spaced  "}\n\n';
        const result = parser.push(text);

        expect(result).toBe('  spaced  ');
      });

      it('should handle chunks with multiple newlines', () => {
        const text = 'data: {"response":"A"}\n\ndata: {"response":"B"}\n\n';
        const result = parser.push(text);

        expect(result).toContain('A');
        expect(result).toContain('B');
      });
    });

    describe('flush', () => {
      it('should flush buffered incomplete line with data: prefix', () => {
        const text = 'data: {"response":"buffered"';
        parser.push(text);
        const result = parser.flush();

        expect(result).toBe('');
      });

      it('should return empty string if no buffered content', () => {
        const result = parser.flush();

        expect(result).toBe('');
      });

      it('should handle flush after complete line', () => {
        parser.push('data: {"response":"complete"}\n\n');
        const result = parser.flush();

        expect(result).toBe('');
      });

      it('should return empty for [DONE]', () => {
        parser.push('data: [DONE]');
        const result = parser.flush();

        expect(result).toBe('');
      });

      it('should clear buffer after flush', () => {
        parser.push('data: {"response":"test');
        parser.flush();
        const result2 = parser.flush();

        expect(result2).toBe('');
      });
    });

    describe('edge cases', () => {
      it('should handle very long content chunks', () => {
        const longContent = 'x'.repeat(10000);
        const text = `data: {"response":"${longContent}"}\n\n`;
        const result = parser.push(text);

        expect(result).toBe(longContent);
      });

      it('should handle rapid sequential pushes', () => {
        const chunks = [
          'data: {"response":"A"}\n\n',
          'data: {"response":"B"}\n\n',
          'data: {"response":"C"}\n\n',
        ];

        const results = chunks.map((chunk) => parser.push(chunk));

        expect(results.join('')).toBe('ABC');
      });

      it('should handle special characters in response', () => {
        const special = 'test! @ # special characters';
        const text = `data: {"response":"${special}"}\n\n`;
        const result = parser.push(text);

        expect(result).toContain('test!');
        expect(result).toContain('special');
      });

      it('should handle Unicode characters', () => {
        const unicode = '你好世界 🌍 مرحبا';
        const text = `data: {"response":"${unicode}"}\n\n`;
        const result = parser.push(text);

        expect(result).toBe(unicode);
      });
    });
  });

  describe('parseSseChunk', () => {
    it('should parse single SSE chunk', () => {
      const chunk = 'data: {"response":"hello"}\n\n';
      const result = parseSseChunk(chunk);

      expect(result).toBe('hello');
    });

    it('should handle multiple lines in chunk', () => {
      const chunk = 'data: {"response":"line1"}\ndata: {"response":"line2"}\n\n';
      const result = parseSseChunk(chunk);

      expect(result).toContain('line1');
      expect(result).toContain('line2');
    });

    it('should be shorthand for push() on new parser', () => {
      const chunk = 'data: {"response":"test"}\n\n';

      const parser = new SseLineParser();
      const parserResult = parser.push(chunk);
      const convenience = parseSseChunk(chunk);

      expect(parserResult).toBe(convenience);
    });
  });

  describe('Stream integration scenarios', () => {
    it('should handle CloudFlare format streaming', () => {
      const parser = new SseLineParser();

      const chunks = [
        'data: {"response":"The"}\n\ndata: {"response":" answer"}\n\n',
        'data: {"response":" is"}\n\n',
        'data: {"response":" 42"}\n\ndata: [DONE]\n\n',
      ];

      const result = chunks.map((chunk) => parser.push(chunk)).join('');
      const flushed = parser.flush();

      expect((result + flushed).trim()).toBe('The answer is 42');
    });

    it('should handle OpenAI format streaming', () => {
      const parser = new SseLineParser();

      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const result = chunks.map((chunk) => parser.push(chunk)).join('');

      expect(result).toBe('Hello world');
    });
  });
});
