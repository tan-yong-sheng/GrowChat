import { describe, expect, it } from 'vitest';
import {
  decodeDataUrl,
  normalizeToolParameters,
  convertJsonSchemaToOpenApiSchema,
  isEmptyObjectSchema,
  normalizeToolChoice,
  buildToolCallNameMap,
  contentToText,
} from './provider-adapters-utils.js';

describe('provider-adapters-utils', () => {
  describe('decodeDataUrl', () => {
    it('decodes valid data URL', () => {
      const result = decodeDataUrl('data:image/png;base64,abc123');
      expect(result).toEqual({ mimeType: 'image/png', data: 'abc123' });
    });

    it('returns null for non-data URL', () => {
      expect(decodeDataUrl('https://example.com/image.png')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(decodeDataUrl('')).toBeNull();
    });

    it('returns null for null/undefined', () => {
      expect(decodeDataUrl(null)).toBeNull();
      expect(decodeDataUrl(undefined)).toBeNull();
    });

    it('is case-insensitive for the data: prefix pattern', () => {
      const result = decodeDataUrl('DATA:image/jpeg;base64,xyz');
      expect(result).toEqual({ mimeType: 'image/jpeg', data: 'xyz' });
    });

    it('handles special characters in base64 data', () => {
      const result = decodeDataUrl('data:text/plain;base64,aGVsbG8=');
      expect(result).toEqual({ mimeType: 'text/plain', data: 'aGVsbG8=' });
    });

    it('returns null for missing base64 marker', () => {
      expect(decodeDataUrl('data:image/png,rawdata')).toBeNull();
    });
  });

  describe('normalizeToolParameters', () => {
    it('delegates to convertJsonSchemaToOpenApiSchema', () => {
      const schema = { type: 'object', properties: { name: { type: 'string' } } };
      const result = normalizeToolParameters(schema);
      expect(result.type).toBe('object');
      expect(result.properties).toBeDefined();
      expect(result.properties.name.type).toBe('string');
    });

    it('returns undefined for null input', () => {
      expect(normalizeToolParameters(null)).toBeUndefined();
    });
  });

  describe('convertJsonSchemaToOpenApiSchema', () => {
    it('returns undefined for null input at root', () => {
      expect(convertJsonSchemaToOpenApiSchema(null)).toBeUndefined();
    });

    it('returns undefined for undefined input at root', () => {
      expect(convertJsonSchemaToOpenApiSchema(undefined)).toBeUndefined();
    });

    it('converts empty object schema to undefined at root', () => {
      expect(convertJsonSchemaToOpenApiSchema({ type: 'object' })).toBeUndefined();
    });

    it('converts empty object schema to type object when not root', () => {
      expect(convertJsonSchemaToOpenApiSchema({ type: 'object' }, false)).toEqual({
        type: 'object',
      });
    });

    it('preserves description on empty object schema at non-root', () => {
      expect(
        convertJsonSchemaToOpenApiSchema({ type: 'object', description: 'desc' }, false),
      ).toEqual({ type: 'object', description: 'desc' });
    });

    it('handles boolean schema', () => {
      expect(convertJsonSchemaToOpenApiSchema(true)).toEqual({ type: 'boolean', properties: {} });
    });

    it('passes through array values as-is', () => {
      expect(convertJsonSchemaToOpenApiSchema(['a', 'b'])).toEqual(['a', 'b']);
    });

    it('passes through primitive values as-is', () => {
      expect(convertJsonSchemaToOpenApiSchema('hello')).toBe('hello');
      expect(convertJsonSchemaToOpenApiSchema(42)).toBe(42);
    });

    it('converts type array with null to nullable + anyOf', () => {
      const result = convertJsonSchemaToOpenApiSchema({ type: ['string', 'null'] });
      expect(result.nullable).toBe(true);
      expect(result.anyOf).toEqual([{ type: 'string' }]);
    });

    it('converts type array with only null to type null', () => {
      const result = convertJsonSchemaToOpenApiSchema({ type: ['null'] });
      expect(result.type).toBe('null');
    });

    it('converts type array with multiple non-null types', () => {
      const result = convertJsonSchemaToOpenApiSchema({ type: ['string', 'number', 'null'] });
      expect(result.nullable).toBe(true);
      expect(result.anyOf).toEqual([{ type: 'string' }, { type: 'number' }]);
    });

    it('converts simple object with properties', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'integer' } },
        required: ['name'],
        description: 'A person',
      });
      expect(result).toEqual({
        type: 'object',
        description: 'A person',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
      });
    });

    it('converts array items', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: 'array',
        items: { type: 'string' },
      });
      expect(result).toEqual({ type: 'array', items: { type: 'string' } });
    });

    it('converts array with tuple items', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: 'array',
        items: [{ type: 'string' }, { type: 'integer' }],
      });
      expect(result.items).toEqual([{ type: 'string' }, { type: 'integer' }]);
    });

    it('converts allOf', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        allOf: [{ type: 'object', properties: { a: { type: 'string' } } }],
      });
      expect(result.allOf).toEqual([{ type: 'object', properties: { a: { type: 'string' } } }]);
    });

    it('converts anyOf', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        anyOf: [{ type: 'string' }, { type: 'integer' }],
      });
      expect(result.anyOf).toEqual([{ type: 'string' }, { type: 'integer' }]);
    });

    it('converts anyOf with null type to nullable', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        anyOf: [{ type: 'null' }, { type: 'string' }],
      });
      expect(result.nullable).toBe(true);
      expect(result.type).toBe('string');
    });

    it('converts anyOf with null and multiple types', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        anyOf: [{ type: 'null' }, { type: 'string' }, { type: 'integer' }],
      });
      expect(result.nullable).toBe(true);
      expect(result.anyOf).toEqual([{ type: 'string' }, { type: 'integer' }]);
    });

    it('converts oneOf', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        oneOf: [{ type: 'string' }, { type: 'integer' }],
      });
      expect(result.oneOf).toEqual([{ type: 'string' }, { type: 'integer' }]);
    });

    it('preserves format field', () => {
      const result = convertJsonSchemaToOpenApiSchema({ type: 'string', format: 'date-time' });
      expect(result.format).toBe('date-time');
    });

    it('preserves minLength', () => {
      const result = convertJsonSchemaToOpenApiSchema({ type: 'string', minLength: 1 });
      expect(result.minLength).toBe(1);
    });

    it('converts const to enum', () => {
      const result = convertJsonSchemaToOpenApiSchema({ const: 'fixed' });
      expect(result.enum).toEqual(['fixed']);
    });

    it('preserves enum values', () => {
      const result = convertJsonSchemaToOpenApiSchema({ type: 'string', enum: ['a', 'b'] });
      expect(result.enum).toEqual(['a', 'b']);
    });

    it('handles nested properties recursively', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
          },
        },
      });
      expect(result.properties.address.type).toBe('object');
      expect(result.properties.address.properties.city.type).toBe('string');
    });
  });

  describe('isEmptyObjectSchema', () => {
    it('returns true for empty object schema', () => {
      expect(isEmptyObjectSchema({ type: 'object' })).toBe(true);
    });

    it('returns true for object schema with empty properties', () => {
      expect(isEmptyObjectSchema({ type: 'object', properties: {} })).toBe(true);
    });

    it('returns false for object schema with properties', () => {
      expect(isEmptyObjectSchema({ type: 'object', properties: { name: { type: 'string' } } })).toBe(false);
    });

    it('returns false for non-object type', () => {
      expect(isEmptyObjectSchema({ type: 'string' })).toBe(false);
    });

    it('returns false for null', () => {
      expect(isEmptyObjectSchema(null)).toBe(false);
    });

    it('returns false for schema with additionalProperties', () => {
      expect(isEmptyObjectSchema({ type: 'object', additionalProperties: true })).toBe(false);
    });
  });

  describe('normalizeToolChoice', () => {
    it('returns undefined for null', () => {
      expect(normalizeToolChoice(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(normalizeToolChoice(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(normalizeToolChoice('')).toBeUndefined();
    });

    it('normalizes string "auto"', () => {
      expect(normalizeToolChoice('auto')).toEqual({ type: 'auto' });
    });

    it('normalizes string "none"', () => {
      expect(normalizeToolChoice('none')).toEqual({ type: 'none' });
    });

    it('normalizes string "required"', () => {
      expect(normalizeToolChoice('required')).toEqual({ type: 'required' });
    });

    it('is case-insensitive for strings', () => {
      expect(normalizeToolChoice('AUTO')).toEqual({ type: 'auto' });
      expect(normalizeToolChoice('None')).toEqual({ type: 'none' });
    });

    it('returns undefined for unknown string', () => {
      expect(normalizeToolChoice('maybe')).toBeUndefined();
    });

    it('normalizes object with type "auto"', () => {
      expect(normalizeToolChoice({ type: 'auto' })).toEqual({ type: 'auto' });
    });

    it('normalizes object with type "tool" and toolName', () => {
      expect(normalizeToolChoice({ type: 'tool', toolName: 'get_weather' })).toEqual({
        type: 'tool',
        toolName: 'get_weather',
      });
    });

    it('normalizes object with type "tool" and name', () => {
      expect(normalizeToolChoice({ type: 'tool', name: 'search' })).toEqual({
        type: 'tool',
        toolName: 'search',
      });
    });

    it('normalizes object with type "tool" and function.name', () => {
      expect(normalizeToolChoice({ type: 'tool', function: { name: 'lookup' } })).toEqual({
        type: 'tool',
        toolName: 'lookup',
      });
    });

    it('normalizes object with type "function" and function.name', () => {
      expect(normalizeToolChoice({ type: 'function', function: { name: 'calc' } })).toEqual({
        type: 'tool',
        toolName: 'calc',
      });
    });

    it('normalizes object with type "function" and name', () => {
      expect(normalizeToolChoice({ type: 'function', name: 'calc' })).toEqual({
        type: 'tool',
        toolName: 'calc',
      });
    });

    it('returns undefined for type "tool" without name', () => {
      expect(normalizeToolChoice({ type: 'tool' })).toBeUndefined();
    });

    it('returns undefined for object without type', () => {
      expect(normalizeToolChoice({})).toBeUndefined();
    });

    it('returns undefined for unknown type', () => {
      expect(normalizeToolChoice({ type: 'custom' })).toBeUndefined();
    });
  });

  describe('buildToolCallNameMap', () => {
    it('builds a map from tool call ids to names', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [
            { id: 'call_1', function: { name: 'weather' } },
            { id: 'call_2', function: { name: 'search' } },
          ],
        },
      ];
      const map = buildToolCallNameMap(messages);
      expect(map.get('call_1')).toBe('weather');
      expect(map.get('call_2')).toBe('search');
    });

    it('ignores non-assistant messages', () => {
      const messages = [
        { role: 'user', content: 'hi' },
        { role: 'tool', name: 'weather', content: 'sunny' },
      ];
      const map = buildToolCallNameMap(messages);
      expect(map.size).toBe(0);
    });

    it('skips tool calls without id or name', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [
            { id: '', function: { name: 'weather' } },
            { id: 'call_2', function: { name: '' } },
            { id: 'call_3', function: { name: 'search' } },
          ],
        },
      ];
      const map = buildToolCallNameMap(messages);
      expect(map.size).toBe(1);
      expect(map.get('call_3')).toBe('search');
    });

    it('returns empty map for empty messages', () => {
      expect(buildToolCallNameMap([]).size).toBe(0);
    });

    it('returns empty map for null/undefined', () => {
      expect(buildToolCallNameMap(null).size).toBe(0);
      expect(buildToolCallNameMap(undefined).size).toBe(0);
    });

    it('handles assistant messages without tool_calls', () => {
      const messages = [{ role: 'assistant', content: 'no tools' }];
      expect(buildToolCallNameMap(messages).size).toBe(0);
    });

    it('handles multiple assistant messages', () => {
      const messages = [
        { role: 'assistant', tool_calls: [{ id: 'a', function: { name: 'fn_a' } }] },
        { role: 'user', content: 'ok' },
        { role: 'assistant', tool_calls: [{ id: 'b', function: { name: 'fn_b' } }] },
      ];
      const map = buildToolCallNameMap(messages);
      expect(map.size).toBe(2);
    });
  });

  describe('contentToText', () => {
    it('returns string directly', () => {
      expect(contentToText('hello')).toBe('hello');
    });

    it('joins array of text parts', () => {
      expect(
        contentToText([
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' },
        ]),
      ).toBe('Hello\nWorld');
    });

    it('extracts text from tool-type parts', () => {
      expect(contentToText([{ type: 'tool', content: 'result data' }])).toBe('result data');
    });

    it('skips unknown part types', () => {
      expect(
        contentToText([
          { type: 'image_url', image_url: { url: 'http://x' } },
          { type: 'text', text: 'visible' },
        ]),
      ).toBe('visible');
    });

    it('skips null and empty parts', () => {
      expect(contentToText([null, '', { type: 'text', text: 'ok' }])).toBe('ok');
    });

    it('handles string items in array', () => {
      expect(contentToText(['plain', { type: 'text', text: 'structured' }])).toBe(
        'plain\nstructured',
      );
    });

    it('returns empty string for non-string, non-array', () => {
      expect(contentToText(42)).toBe('');
      expect(contentToText(null)).toBe('');
      expect(contentToText(undefined)).toBe('');
    });

    it('returns empty string for empty array', () => {
      expect(contentToText([])).toBe('');
    });

    it('joins with newlines and filters empty', () => {
      expect(contentToText([{ type: 'text', text: 'a' }, { type: 'text', text: '' }, { type: 'text', text: 'b' }])).toBe('a\nb');
    });
  });
});
