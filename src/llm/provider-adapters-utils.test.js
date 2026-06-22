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
    it('decodes a valid data URL', () => {
      const result = decodeDataUrl('data:image/png;base64,iVBORw0KGgo=');
      expect(result).toEqual({ mimeType: 'image/png', data: 'iVBORw0KGgo=' });
    });

    it('decodes a data URL with extra spaces', () => {
      const result = decodeDataUrl('  data:text/plain;base64,SGVsbG8=  ');
      expect(result).toEqual({ mimeType: 'text/plain', data: 'SGVsbG8=' });
    });

    it('returns null for invalid data URL', () => {
      expect(decodeDataUrl('not-a-data-url')).toBeNull();
      expect(decodeDataUrl('https://example.com/image.png')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(decodeDataUrl('')).toBeNull();
      expect(decodeDataUrl(null)).toBeNull();
      expect(decodeDataUrl(undefined)).toBeNull();
    });

    it('handles data URL without base64', () => {
      // Regex requires base64, so this should fail
      expect(decodeDataUrl('data:text/plain,Hello')).toBeNull();
    });

    it('handles data URL with uppercase DATA', () => {
      const result = decodeDataUrl('DATA:IMAGE/JPEG;BASE64,/9J/4AAQ');
      expect(result).toEqual({ mimeType: 'IMAGE/JPEG', data: '/9J/4AAQ' });
    });
  });

  describe('normalizeToolParameters', () => {
    it('converts JSON schema to OpenAPI schema', () => {
      const input = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      };
      const result = normalizeToolParameters(input);
      expect(result).toEqual(input);
    });
  });

  describe('convertJsonSchemaToOpenApiSchema', () => {
    it('returns undefined for null input', () => {
      expect(convertJsonSchemaToOpenApiSchema(null)).toBeUndefined();
    });

    it('returns undefined for undefined input', () => {
      expect(convertJsonSchemaToOpenApiSchema(undefined)).toBeUndefined();
    });

    it('returns undefined for empty object schema at root', () => {
      expect(convertJsonSchemaToOpenApiSchema({ type: 'object' })).toBeUndefined();
    });

    it('returns object type for empty object schema at non-root', () => {
      const result = convertJsonSchemaToOpenApiSchema({ type: 'object' }, false);
      expect(result).toEqual({ type: 'object' });
    });

    it('returns object with description for empty object schema with description', () => {
      const result = convertJsonSchemaToOpenApiSchema(
        { type: 'object', description: 'An object' },
        false
      );
      expect(result).toEqual({ type: 'object', description: 'An object' });
    });

    it('converts boolean to boolean schema', () => {
      const result = convertJsonSchemaToOpenApiSchema(true);
      expect(result).toEqual({ type: 'boolean', properties: {} });
    });

    it('returns array as-is', () => {
      const input = [{ type: 'string' }];
      expect(convertJsonSchemaToOpenApiSchema(input)).toBe(input);
    });

    it('returns non-object primitives as-is', () => {
      expect(convertJsonSchemaToOpenApiSchema('string')).toBe('string');
      expect(convertJsonSchemaToOpenApiSchema(42)).toBe(42);
    });

    it('copies description field', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: 'string',
        description: 'A name',
      });
      expect(result.description).toBe('A name');
    });

    it('copies required field', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      });
      expect(result.required).toEqual(['name']);
    });

    it('copies format field', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: 'string',
        format: 'email',
      });
      expect(result.format).toBe('email');
    });

    it('converts const to enum', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        const: 'fixed_value',
      });
      expect(result.enum).toEqual(['fixed_value']);
    });

    it('handles simple type', () => {
      const result = convertJsonSchemaToOpenApiSchema({ type: 'string' });
      expect(result.type).toBe('string');
    });

    it('handles type array with null', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: ['string', 'null'],
      });
      expect(result).toEqual({
        anyOf: [{ type: 'string' }],
        nullable: true,
      });
    });

    it('handles type array without null', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: ['string', 'number'],
      });
      expect(result).toEqual({
        anyOf: [{ type: 'string' }, { type: 'number' }],
      });
    });

    it('handles type array with only null', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: ['null'],
      });
      expect(result).toEqual({ type: 'null' });
    });

    it('copies enum values', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: 'string',
        enum: ['a', 'b', 'c'],
      });
      expect(result.enum).toEqual(['a', 'b', 'c']);
    });

    it('handles properties recursively', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
      });
      expect(result.properties).toEqual({
        name: { type: 'string' },
        age: { type: 'integer' },
      });
    });

    it('handles items as object', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: 'array',
        items: { type: 'string' },
      });
      expect(result.items).toEqual({ type: 'string' });
    });

    it('handles items as array', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: 'array',
        items: [{ type: 'string' }, { type: 'number' }],
      });
      expect(result.items).toEqual([{ type: 'string' }, { type: 'number' }]);
    });

    it('handles allOf', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        allOf: [{ type: 'string' }, { type: 'number' }],
      });
      expect(result.allOf).toEqual([{ type: 'string' }, { type: 'number' }]);
    });

    it('handles anyOf without null', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        anyOf: [{ type: 'string' }, { type: 'number' }],
      });
      expect(result.anyOf).toEqual([{ type: 'string' }, { type: 'number' }]);
    });

    it('handles anyOf with nullable null schema', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        anyOf: [{ type: 'string' }, { type: 'null' }],
      });
      expect(result.nullable).toBe(true);
      expect(result.type).toBe('string');
    });

    it('handles anyOf with multiple non-null schemas', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }],
      });
      expect(result.nullable).toBe(true);
      expect(result.anyOf).toEqual([{ type: 'string' }, { type: 'number' }]);
    });

    it('handles anyOf with null only', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        anyOf: [{ type: 'null' }],
      });
      expect(result.anyOf).toEqual([]);
      expect(result.nullable).toBe(true);
    });

    it('handles oneOf', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        oneOf: [{ type: 'string' }, { type: 'number' }],
      });
      expect(result.oneOf).toEqual([{ type: 'string' }, { type: 'number' }]);
    });

    it('copies minLength', () => {
      const result = convertJsonSchemaToOpenApiSchema({
        type: 'string',
        minLength: 5,
      });
      expect(result.minLength).toBe(5);
    });

    it('handles deeply nested structure', () => {
      const input = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              tags: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      };
      const result = convertJsonSchemaToOpenApiSchema(input);
      expect(result.properties.user.properties.name).toEqual({ type: 'string' });
      expect(result.properties.user.properties.tags).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
    });

    it('preserves required at nested level', () => {
      const input = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
      };
      const result = convertJsonSchemaToOpenApiSchema(input);
      expect(result.properties.user.required).toEqual(['name']);
    });
  });

  describe('isEmptyObjectSchema', () => {
    it('returns true for empty object schema', () => {
      expect(isEmptyObjectSchema({ type: 'object' })).toBe(true);
      expect(isEmptyObjectSchema({ type: 'object', properties: {} })).toBe(true);
    });

    it('returns false for object with properties', () => {
      expect(
        isEmptyObjectSchema({ type: 'object', properties: { name: { type: 'string' } } })
      ).toBe(false);
    });

    it('returns false for object with additionalProperties', () => {
      expect(isEmptyObjectSchema({ type: 'object', additionalProperties: true })).toBe(false);
    });

    it('returns false for non-object input', () => {
      expect(isEmptyObjectSchema(null)).toBe(false);
      expect(isEmptyObjectSchema('string')).toBe(false);
      expect(isEmptyObjectSchema(42)).toBe(false);
    });

    it('returns false for non-object type', () => {
      expect(isEmptyObjectSchema({ type: 'string' })).toBe(false);
    });

    it('returns false for null input', () => {
      expect(isEmptyObjectSchema(null)).toBe(false);
      expect(isEmptyObjectSchema(undefined)).toBe(false);
    });
  });

  describe('normalizeToolChoice', () => {
    it('returns undefined for falsy input', () => {
      expect(normalizeToolChoice(null)).toBeUndefined();
      expect(normalizeToolChoice(undefined)).toBeUndefined();
      expect(normalizeToolChoice('')).toBeUndefined();
    });

    it('handles string "auto"', () => {
      expect(normalizeToolChoice('auto')).toEqual({ type: 'auto' });
    });

    it('handles string "none"', () => {
      expect(normalizeToolChoice('none')).toEqual({ type: 'none' });
    });

    it('handles string "required"', () => {
      expect(normalizeToolChoice('required')).toEqual({ type: 'required' });
    });

    it('handles uppercase string', () => {
      expect(normalizeToolChoice('AUTO')).toEqual({ type: 'auto' });
    });

    it('returns undefined for unknown string', () => {
      expect(normalizeToolChoice('something_else')).toBeUndefined();
    });

    it('handles object with type auto', () => {
      expect(normalizeToolChoice({ type: 'auto' })).toEqual({ type: 'auto' });
    });

    it('handles object with type none', () => {
      expect(normalizeToolChoice({ type: 'none' })).toEqual({ type: 'none' });
    });

    it('handles object with type required', () => {
      expect(normalizeToolChoice({ type: 'required' })).toEqual({ type: 'required' });
    });

    it('returns undefined for object with empty type', () => {
      expect(normalizeToolChoice({ type: '' })).toBeUndefined();
    });

    it('returns undefined for object with unknown type', () => {
      expect(normalizeToolChoice({ type: 'invalid' })).toBeUndefined();
    });

    it('handles tool choice with toolName', () => {
      expect(normalizeToolChoice({ type: 'tool', toolName: 'get_weather' })).toEqual({
        type: 'tool',
        toolName: 'get_weather',
      });
    });

    it('handles tool choice with name', () => {
      expect(normalizeToolChoice({ type: 'tool', name: 'get_weather' })).toEqual({
        type: 'tool',
        toolName: 'get_weather',
      });
    });

    it('handles function choice with function.name', () => {
      expect(normalizeToolChoice({ type: 'function', function: { name: 'get_weather' } })).toEqual({
        type: 'tool',
        toolName: 'get_weather',
      });
    });

    it('handles function choice with name (not function.name)', () => {
      expect(normalizeToolChoice({ type: 'function', name: 'get_weather' })).toEqual({
        type: 'tool',
        toolName: 'get_weather',
      });
    });

    it('returns undefined for tool type without name', () => {
      expect(normalizeToolChoice({ type: 'tool' })).toBeUndefined();
    });

    it('returns undefined for function type without name', () => {
      expect(normalizeToolChoice({ type: 'function' })).toBeUndefined();
    });
  });

  describe('buildToolCallNameMap', () => {
    it('returns empty map for empty messages', () => {
      expect(buildToolCallNameMap([])).toEqual(new Map());
    });

    it('returns empty map for non-assistant messages', () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      expect(buildToolCallNameMap(messages)).toEqual(new Map());
    });

    it('builds map from assistant tool_calls', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [
            { id: 'call_1', function: { name: 'get_weather' } },
            { id: 'call_2', function: { name: 'get_time' } },
          ],
        },
      ];
      const map = buildToolCallNameMap(messages);
      expect(map.get('call_1')).toBe('get_weather');
      expect(map.get('call_2')).toBe('get_time');
    });

    it('ignores tool calls without id', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [{ function: { name: 'get_weather' } }],
        },
      ];
      expect(buildToolCallNameMap(messages)).toEqual(new Map());
    });

    it('ignores tool calls without name', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [{ id: 'call_1', function: {} }],
        },
      ];
      expect(buildToolCallNameMap(messages)).toEqual(new Map());
    });

    it('handles null tool_calls', () => {
      const messages = [{ role: 'assistant', tool_calls: null }];
      expect(buildToolCallNameMap(messages)).toEqual(new Map());
    });

    it('handles missing function in tool_calls', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [{ id: 'call_1' }],
        },
      ];
      expect(buildToolCallNameMap(messages)).toEqual(new Map());
    });

    it('handles null messages', () => {
      expect(buildToolCallNameMap(null)).toEqual(new Map());
    });

    it('handles messages with no tool_calls property', () => {
      const messages = [{ role: 'assistant', content: 'Hello' }];
      expect(buildToolCallNameMap(messages)).toEqual(new Map());
    });

    it('trims whitespace from id and name', () => {
      const messages = [
        {
          role: 'assistant',
          tool_calls: [{ id: '  call_1  ', function: { name: '  get_weather  ' } }],
        },
      ];
      const map = buildToolCallNameMap(messages);
      expect(map.get('call_1')).toBe('get_weather');
    });

    it('handles multiple messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          tool_calls: [{ id: 'call_1', function: { name: 'func1' } }],
        },
        {
          role: 'assistant',
          tool_calls: [{ id: 'call_2', function: { name: 'func2' } }],
        },
      ];
      const map = buildToolCallNameMap(messages);
      expect(map.get('call_1')).toBe('func1');
      expect(map.get('call_2')).toBe('func2');
    });
  });

  describe('contentToText', () => {
    it('returns string as-is', () => {
      expect(contentToText('Hello')).toBe('Hello');
    });

    it('returns empty string for null', () => {
      expect(contentToText(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(contentToText(undefined)).toBe('');
    });

    it('returns empty string for empty array', () => {
      expect(contentToText([])).toBe('');
    });

    it('concatenates text parts', () => {
      const parts = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ];
      expect(contentToText(parts)).toBe('Hello\nWorld');
    });

    it('includes string parts in array', () => {
      const parts = ['Hello', 'World'];
      expect(contentToText(parts)).toBe('Hello\nWorld');
    });

    it('includes tool parts', () => {
      const parts = [{ type: 'tool', content: 'tool result' }];
      expect(contentToText(parts)).toBe('tool result');
    });

    it('filters out empty parts', () => {
      const parts = [
        { type: 'text', text: 'Hello' },
        null,
        { type: 'text', text: '' },
        undefined,
        { type: 'text', text: 'World' },
      ];
      expect(contentToText(parts)).toBe('Hello\nWorld');
    });

    it('handles mixed parts', () => {
      const parts = [
        'string part',
        { type: 'text', text: 'text part' },
        { type: 'tool', content: 'tool part' },
        { type: 'image', url: '...' },
      ];
      expect(contentToText(parts)).toBe('string part\ntext part\ntool part');
    });

    it('returns empty string for number', () => {
      expect(contentToText(42)).toBe('');
    });

    it('handles empty string parts', () => {
      const parts = [{ type: 'text', text: '' }];
      expect(contentToText(parts)).toBe('');
    });
  });
});
