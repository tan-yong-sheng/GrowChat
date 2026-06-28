import { describe, expect, it } from 'vitest';
import {
  isValidHttpUrl,
  normalizeHeaders,
  parseHeadersForRequest,
  normalizeBaseUrl,
  normalizeModelId,
  normalizeAttachmentCaps,
  base64UrlEncode,
  randomString,
  normalizeTool,
  applyToolVisibility,
  mergeToolSpecs,
  normalizeAuthType,
  normalizeTokenAuthMethod,
  mergeToolServer,
} from './tool-servers-utils.js';

describe('isValidHttpUrl', () => {
  it('returns true for valid https URL', () => {
    expect(isValidHttpUrl('https://example.com')).toBe(true);
  });

  it('returns true for valid http URL', () => {
    expect(isValidHttpUrl('http://example.com')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidHttpUrl('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidHttpUrl(null)).toBe(false);
  });

  it('returns false for ftp URL', () => {
    expect(isValidHttpUrl('ftp://example.com')).toBe(false);
  });

  it('returns false for invalid URL', () => {
    expect(isValidHttpUrl('not-a-url')).toBe(false);
  });

  it('returns false for URL without hostname', () => {
    expect(isValidHttpUrl('http://')).toBe(false);
  });

  it('trims whitespace before parsing', () => {
    expect(isValidHttpUrl('  https://example.com  ')).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(isValidHttpUrl(undefined)).toBe(false);
  });
});

describe('normalizeHeaders', () => {
  it('parses and normalizes valid JSON headers', () => {
    const result = normalizeHeaders('{"Authorization":" Bearer x "}');
    const parsed = JSON.parse(result);
    expect(parsed.Authorization).toBe('Bearer x');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeHeaders('')).toBe('');
    expect(normalizeHeaders(null)).toBe('');
    expect(normalizeHeaders(undefined)).toBe('');
  });

  it('throws for invalid JSON', () => {
    expect(() => normalizeHeaders('not-json')).toThrow('Headers must be valid JSON');
  });

  it('throws for array input', () => {
    expect(() => normalizeHeaders('[1,2,3]')).toThrow('Headers must be a JSON object');
  });

  it('throws for empty header name', () => {
    expect(() => normalizeHeaders('{"":"value"}')).toThrow('Header names cannot be empty');
  });

  it('throws for newline in header name', () => {
    // Newline characters in header names are detected after successful JSON parse
    const headerObj = { 'name\ninjection': 'value' };
    expect(() => normalizeHeaders(JSON.stringify(headerObj))).toThrow(
      'Header names cannot contain newline characters'
    );
  });

  it('throws for newline in header value', () => {
    // Newline characters in header values are detected after successful JSON parse
    // Must be non-trailing since .trim() removes trailing whitespace
    const headerObj = { 'X-Custom': 'val\nue' };
    expect(() => normalizeHeaders(JSON.stringify(headerObj))).toThrow(
      'Header values cannot contain newline characters'
    );
  });

  it('trims header names and values', () => {
    const result = normalizeHeaders('{"  X-Auth  ":"  Bearer token  "}');
    const parsed = JSON.parse(result);
    expect(parsed['X-Auth']).toBe('Bearer token');
  });

  it('handles numeric values by converting to string', () => {
    const result = normalizeHeaders('{"X-Count":42}');
    const parsed = JSON.parse(result);
    expect(parsed['X-Count']).toBe('42');
  });

  it('handles null values by converting to empty string', () => {
    const result = normalizeHeaders('{"X-Null":null}');
    const parsed = JSON.parse(result);
    expect(parsed['X-Null']).toBe('');
  });
});

describe('parseHeadersForRequest', () => {
  it('returns object input directly', () => {
    const obj = { a: '1' };
    expect(parseHeadersForRequest(obj)).toBe(obj);
  });

  it('parses JSON string and returns object', () => {
    const result = parseHeadersForRequest('{"a":"1"}');
    expect(result).toEqual({ a: '1' });
  });

  it('returns empty object for empty normalized result', () => {
    const result = parseHeadersForRequest('');
    expect(result).toEqual({});
  });

  it('rejects array input', () => {
    // parseHeadersForRequest checks for object type first; arrays pass the object check
    // but normalizeHeaders rejects them as 'Headers must be a JSON object'
    expect(() => parseHeadersForRequest([1, 2])).toThrow('Headers must be valid JSON');
  });
});

describe('normalizeBaseUrl', () => {
  it('removes trailing slash', () => {
    expect(normalizeBaseUrl('https://example.com/v1/')).toBe('https://example.com/v1');
  });

  it('handles URL without trailing slash', () => {
    expect(normalizeBaseUrl('https://example.com')).toBe('https://example.com');
  });

  it('trims whitespace', () => {
    expect(normalizeBaseUrl('  https://example.com  ')).toBe('https://example.com');
  });

  it('returns empty string for null', () => {
    expect(normalizeBaseUrl(null)).toBe('');
  });
});

describe('normalizeModelId', () => {
  it('trims whitespace', () => {
    expect(normalizeModelId(' model-1 ')).toBe('model-1');
  });

  it('returns null for empty string', () => {
    expect(normalizeModelId('')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(normalizeModelId('   ')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(normalizeModelId(null)).toBeNull();
  });

  it('throws for model id exceeding 200 chars', () => {
    expect(() => normalizeModelId('a'.repeat(201))).toThrow('model_id is invalid');
  });

  it('throws for model id containing whitespace', () => {
    expect(() => normalizeModelId('model id')).toThrow('model_id is invalid');
  });

  it('accepts model id at 200 chars', () => {
    expect(normalizeModelId('a'.repeat(200))).toBe('a'.repeat(200));
  });
});

describe('normalizeAttachmentCaps', () => {
  it('normalizes valid attachment capabilities', () => {
    expect(normalizeAttachmentCaps({ image: true, pdf: false })).toEqual({
      image: true,
      pdf: false,
    });
  });

  it('allows null values when allowNull is true', () => {
    expect(normalizeAttachmentCaps({ image: true, pdf: null }, { allowNull: true })).toEqual({
      image: true,
      pdf: null,
    });
  });

  it('throws for null value when allowNull is false', () => {
    expect(() => normalizeAttachmentCaps({ image: null })).toThrow(
      'Attachment type image must be a boolean'
    );
  });

  it('throws for non-object input', () => {
    expect(() => normalizeAttachmentCaps('image:true')).toThrow('attachments must be an object');
  });

  it('throws for array input', () => {
    expect(() => normalizeAttachmentCaps(['image'])).toThrow('attachments must be an object');
  });

  it('throws for unknown attachment type', () => {
    expect(() => normalizeAttachmentCaps({ unknown: true })).toThrow(
      'Unknown attachment type: unknown'
    );
  });

  it('throws for non-boolean value', () => {
    expect(() => normalizeAttachmentCaps({ image: 'yes' })).toThrow(
      'Attachment type image must be a boolean'
    );
  });

  it('accepts all valid attachment types', () => {
    const caps = { image: true, pdf: true, text: true, audio: true, video: true, other: true };
    expect(normalizeAttachmentCaps(caps)).toEqual(caps);
  });
});

describe('base64UrlEncode', () => {
  it('encodes bytes to base64url', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const result = base64UrlEncode(bytes);
    expect(result).toBe('SGVsbG8');
  });

  it('replaces + with -', () => {
    const bytes = new Uint8Array([0xfb]); // Encodes to + in base64
    const result = base64UrlEncode(bytes);
    expect(result).not.toContain('+');
    expect(result).toContain('-');
  });

  it('replaces / with _', () => {
    const bytes = new Uint8Array([0xff]);
    const result = base64UrlEncode(bytes);
    expect(result).not.toContain('/');
    expect(result).toContain('_');
  });

  it('removes trailing = padding', () => {
    const bytes = new Uint8Array([1]); // Would have padding
    const result = base64UrlEncode(bytes);
    expect(result).not.toContain('=');
  });
});

describe('randomString', () => {
  it('generates string of specified length', () => {
    const result = randomString(20);
    expect(result.length).toBe(20);
  });

  it('generates string of default length 43', () => {
    const result = randomString();
    expect(result.length).toBe(43);
  });

  it('generates different strings on successive calls', () => {
    const a = randomString();
    const b = randomString();
    expect(a).not.toBe(b);
  });
});

describe('normalizeTool', () => {
  it('normalizes a tool object', () => {
    const tool = normalizeTool({ name: 'read', description: 'Read a file', enabled: true });
    expect(tool.name).toBe('read');
    expect(tool.description).toBe('Read a file');
    expect(tool.enabled).toBe(true);
  });

  it('defaults enabled to true', () => {
    expect(normalizeTool({ name: 'test' }).enabled).toBe(true);
  });

  it('respects enabled: false', () => {
    expect(normalizeTool({ name: 'test', enabled: false }).enabled).toBe(false);
  });

  it('trims whitespace from string fields', () => {
    const tool = normalizeTool({ name: ' test ', title: ' Title ', description: ' Desc ' });
    expect(tool.name).toBe('test');
    expect(tool.title).toBe('Title');
    expect(tool.description).toBe('Desc');
  });

  it('includes parameters when valid object', () => {
    const params = { type: 'object', properties: {} };
    const tool = normalizeTool({ name: 'test', parameters: params });
    expect(tool.parameters).toEqual(params);
  });

  it('excludes parameters when not an object', () => {
    const tool = normalizeTool({ name: 'test', parameters: 'string' });
    expect(tool.parameters).toBeUndefined();
  });

  it('excludes parameters when array', () => {
    const tool = normalizeTool({ name: 'test', parameters: [1, 2] });
    expect(tool.parameters).toBeUndefined();
  });

  it('handles empty input', () => {
    const tool = normalizeTool({});
    expect(tool.name).toBe('');
  });
});

describe('applyToolVisibility', () => {
  it('marks hidden tools as hidden_for_user', () => {
    const server = { tools: [{ name: 'secret' }, { name: 'public' }] };
    const result = applyToolVisibility(server, new Set(['secret']));
    expect(result.tools[0].hidden_for_user).toBe(true);
    expect(result.tools[0].visible_for_user).toBe(false);
    expect(result.tools[1].hidden_for_user).toBe(false);
    expect(result.tools[1].visible_for_user).toBe(true);
  });

  it('accepts array for hiddenTools', () => {
    const server = { tools: [{ name: 'a' }] };
    const result = applyToolVisibility(server, ['a']);
    expect(result.tools[0].hidden_for_user).toBe(true);
  });

  it('handles empty tools array', () => {
    const result = applyToolVisibility({ tools: [] }, new Set());
    expect(result.tools).toEqual([]);
  });

  it('handles server without tools', () => {
    const result = applyToolVisibility({}, new Set());
    expect(result.tools).toEqual([]);
  });

  it('handles hiddenTools as plain array', () => {
    const server = { tools: [{ name: 'a' }, { name: 'b' }] };
    const result = applyToolVisibility(server, ['a']);
    expect(result.tools[0].hidden_for_user).toBe(true);
    expect(result.tools[1].hidden_for_user).toBe(false);
  });
});

describe('mergeToolSpecs', () => {
  it('merges tool specs preserving enabled state', () => {
    const existing = [
      { name: 'tool1', enabled: false },
      { name: 'tool2', enabled: true },
    ];
    const incoming = [
      { name: 'tool1', enabled: true },
      { name: 'tool3', enabled: true },
    ];
    const result = mergeToolSpecs(existing, incoming);
    expect(result).toHaveLength(2);
    // tool1 keeps prior enabled: false
    const tool1 = result.find((t) => t.name === 'tool1');
    expect(tool1.enabled).toBe(false);
    // tool3 is new, uses its own enabled
    const tool3 = result.find((t) => t.name === 'tool3');
    expect(tool3.enabled).toBe(true);
  });

  it('filters out tools without name', () => {
    const result = mergeToolSpecs([], [{ name: '' }, { name: 'valid' }]);
    expect(result).toHaveLength(1);
  });

  it('falls back to existing when incoming is not array', () => {
    const existing = [{ name: 'tool1' }];
    const result = mergeToolSpecs(existing, null);
    expect(result).toHaveLength(1);
  });

  it('returns empty array when both are empty', () => {
    expect(mergeToolSpecs([], [])).toEqual([]);
  });
});

describe('normalizeAuthType', () => {
  it('normalizes known auth types', () => {
    expect(normalizeAuthType('none')).toBe('none');
    expect(normalizeAuthType('bearer')).toBe('bearer');
    expect(normalizeAuthType('basic')).toBe('basic');
    expect(normalizeAuthType('oauth')).toBe('oauth');
  });

  it('is case-insensitive', () => {
    expect(normalizeAuthType('Bearer')).toBe('bearer');
    expect(normalizeAuthType('OAUTH')).toBe('oauth');
  });

  it('returns none for unknown types', () => {
    expect(normalizeAuthType('digest')).toBe('none');
    expect(normalizeAuthType('')).toBe('none');
  });

  it('returns none for null/undefined', () => {
    expect(normalizeAuthType(null)).toBe('none');
    expect(normalizeAuthType(undefined)).toBe('none');
  });
});

describe('normalizeTokenAuthMethod', () => {
  it('normalizes known methods', () => {
    expect(normalizeTokenAuthMethod('client_secret_basic')).toBe('client_secret_basic');
    expect(normalizeTokenAuthMethod('client_secret_post')).toBe('client_secret_post');
    expect(normalizeTokenAuthMethod('none')).toBe('none');
  });

  it('is case-insensitive', () => {
    expect(normalizeTokenAuthMethod('CLIENT_SECRET_BASIC')).toBe('client_secret_basic');
  });

  it('returns undefined for unknown values', () => {
    expect(normalizeTokenAuthMethod('unknown')).toBeUndefined();
    expect(normalizeTokenAuthMethod('')).toBeUndefined();
  });
});

describe('mergeToolServer', () => {
  it('merges incoming into existing', () => {
    const existing = { id: 's1', name: 'Old', url: 'https://old.com' };
    const incoming = { name: 'New' };
    const result = mergeToolServer(existing, incoming);
    expect(result.name).toBe('New');
    expect(result.url).toBe('https://old.com');
  });

  it('generates UUID when no id exists', () => {
    const result = mergeToolServer(null, { name: 'Test', url: 'https://test.com' });
    expect(result.id).toBeDefined();
    expect(result.id).toMatch(/^[0-9a-f-]+$/);
  });

  it('uses incoming id when provided', () => {
    const result = mergeToolServer(null, { id: 'custom-id', name: 'T', url: 'https://t.com' });
    expect(result.id).toBe('custom-id');
  });

  it('defaults name to Tool Server', () => {
    const result = mergeToolServer(null, {});
    expect(result.name).toBe('Tool Server');
  });

  it('truncates name to 120 chars', () => {
    const result = mergeToolServer(null, { name: 'a'.repeat(200) });
    expect(result.name.length).toBe(120);
  });

  it('defaults enabled to true', () => {
    expect(mergeToolServer(null, {}).enabled).toBe(true);
  });

  it('respects incoming enabled: false', () => {
    expect(mergeToolServer(null, { enabled: false }).enabled).toBe(false);
  });

  it('preserves existing enabled when incoming does not specify', () => {
    expect(mergeToolServer({ enabled: false }, {}).enabled).toBe(false);
  });

  it('normalizes auth_type', () => {
    const result = mergeToolServer(null, { auth_type: 'Bearer' });
    expect(result.auth_type).toBe('bearer');
  });

  it('preserves existing auth_type when incoming is undefined', () => {
    const result = mergeToolServer({ auth_type: 'basic' }, {});
    expect(result.auth_type).toBe('basic');
  });

  it('defaults auth_type to none', () => {
    const result = mergeToolServer(null, {});
    expect(result.auth_type).toBe('none');
  });

  it('removes OAuth fields when auth_type is not oauth', () => {
    const existing = {
      auth_type: 'oauth',
      oauth_tokens: { access_token: 'abc' },
      oauth_state: 'state123',
      oauth_code_verifier: 'verifier',
      oauth_connected_at: 123,
    };
    const result = mergeToolServer(existing, { auth_type: 'bearer' });
    expect(result.oauth_tokens).toBeUndefined();
    expect(result.oauth_state).toBeUndefined();
    expect(result.oauth_code_verifier).toBeUndefined();
    expect(result.oauth_connected_at).toBeUndefined();
  });

  it('preserves OAuth fields when auth_type is oauth and incoming does not set them', () => {
    const existing = {
      auth_type: 'oauth',
      oauth_tokens: { access_token: 'abc' },
      oauth_state: 'state123',
      oauth_code_verifier: 'verifier',
      oauth_connected_at: 123,
    };
    const result = mergeToolServer(existing, { auth_type: 'oauth' });
    expect(result.oauth_tokens).toEqual({ access_token: 'abc' });
    expect(result.oauth_state).toBe('state123');
    expect(result.oauth_code_verifier).toBe('verifier');
    expect(result.oauth_connected_at).toBe(123);
  });

  it('trims string fields', () => {
    const result = mergeToolServer(null, {
      url: '  https://test.com  ',
      auth_bearer_token: '  token  ',
      auth_basic_username: '  user  ',
      auth_basic_password: '  pass  ',
      oauth_client_name: '  name  ',
    });
    expect(result.url).toBe('https://test.com');
    expect(result.auth_bearer_token).toBe('token');
    expect(result.auth_basic_username).toBe('user');
    expect(result.auth_basic_password).toBe('pass');
    expect(result.oauth_client_name).toBe('name');
  });

  it('normalizes tools with inputSchema fallback', () => {
    const result = mergeToolServer(null, {
      tools: [
        { name: 'tool1', inputSchema: { type: 'object' } },
        { name: 'tool2', parameters: { type: 'string' } },
      ],
    });
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].parameters).toEqual({ type: 'object' });
    expect(result.tools[1].parameters).toEqual({ type: 'string' });
  });

  it('filters out nameless tools from incoming', () => {
    const result = mergeToolServer(null, {
      tools: [{ name: 'valid' }, { name: '' }, { name: 'also-valid' }],
    });
    expect(result.tools).toHaveLength(2);
  });

  it('uses existing tools when incoming.tools is undefined', () => {
    const existing = { tools: [{ name: 'existing', enabled: true }] };
    const result = mergeToolServer(existing, {});
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('existing');
  });

  it('defaults tools to empty when no existing and no incoming', () => {
    const result = mergeToolServer(null, {});
    expect(result.tools).toEqual([]);
  });

  it('normalizes oauth_token_auth_method', () => {
    const result = mergeToolServer(null, { oauth_token_auth_method: 'CLIENT_SECRET_BASIC' });
    expect(result.oauth_token_auth_method).toBe('client_secret_basic');
  });

  it('defaults oauth_token_auth_method to empty string for unknown value', () => {
    const result = mergeToolServer(null, { oauth_token_auth_method: 'unknown' });
    expect(result.oauth_token_auth_method).toBe('');
  });

  it('handles headers as string preserving it', () => {
    const result = mergeToolServer(null, { headers: '{"Auth":"Bearer"}' });
    expect(result.headers).toBe('{"Auth":"Bearer"}');
  });

  it('handles headers as object preserving it', () => {
    const result = mergeToolServer(null, { headers: { Auth: 'Bearer' } });
    expect(result.headers).toEqual({ Auth: 'Bearer' });
  });

  it('defaults headers to empty string when undefined', () => {
    const result = mergeToolServer(null, {});
    expect(result.headers).toBe('');
  });

  it('preserves existing headers when incoming is undefined', () => {
    const result = mergeToolServer({ headers: 'existing' }, {});
    expect(result.headers).toBe('existing');
  });

  it('handles tools_error and tools_verified_at', () => {
    const result = mergeToolServer({ tools_error: 'old error', tools_verified_at: 100 }, {});
    expect(result.tools_error).toBe('old error');
    expect(result.tools_verified_at).toBe(100);
  });

  it('allows incoming to override tools_error', () => {
    const result = mergeToolServer({ tools_error: 'old' }, { tools_error: 'new' });
    expect(result.tools_error).toBe('new');
  });
});
