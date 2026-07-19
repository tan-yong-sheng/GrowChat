import { z, ZodError } from 'zod';

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const IPV4_OCTET_LOOPBACK = 127;
const IPV4_OCTET_PRIVATE_10 = 10;
const IPV4_OCTET_PRIVATE_172 = 172;
const IPV4_PRIVATE_172_LOW = 16;
const IPV4_PRIVATE_172_HIGH = 31;
const IPV4_OCTET_PRIVATE_192 = 192;
const IPV4_OCTET_PRIVATE_192_B = 168;
const IPV4_OCTET_LINK_LOCAL = 169;
const IPV4_LINK_LOCAL_B = 254;
const IPV4_OCTET_UNSPECIFIED = 0;
const IPV4_OCTET_CGN = 100;
const IPV4_CGN_LOW = 64;
const IPV4_CGN_HIGH = 127;
const IPV4_OCTET_BENCHMARK = 198;
const IPV4_BENCHMARK_18 = 18;
const IPV4_BENCHMARK_19 = 19;
const IPV4_MULTICAST_LOW = 224;
const IPV4_MULTICAST_HIGH = 239;
const IPV4_RESERVED_LOW = 240;
const PASSWORD_MIN_LENGTH = 8;
const NAME_MAX_LENGTH = 100;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.azure.com',
  '169.254.169.254',
]);

// Each entry: { check(a, b) → boolean, reason }
// Ordered from most specific to least specific so the first match wins.
const IPV4_BLOCKED_RANGES = [
  {
    check: (a) => a === IPV4_OCTET_LOOPBACK,
    reason: 'Loopback addresses are not allowed',
  },
  {
    check: (a) => a === IPV4_OCTET_PRIVATE_10,
    reason: 'Private network addresses are not allowed',
  },
  {
    check: (a, b) =>
      a === IPV4_OCTET_PRIVATE_172 && b >= IPV4_PRIVATE_172_LOW && b <= IPV4_PRIVATE_172_HIGH,
    reason: 'Private network addresses are not allowed',
  },
  {
    check: (a, b) => a === IPV4_OCTET_PRIVATE_192 && b === IPV4_OCTET_PRIVATE_192_B,
    reason: 'Private network addresses are not allowed',
  },
  {
    check: (a, b) => a === IPV4_OCTET_LINK_LOCAL && b === IPV4_LINK_LOCAL_B,
    reason: 'Link-local addresses are not allowed',
  },
  {
    check: (a) => a === IPV4_OCTET_UNSPECIFIED,
    reason: 'Unspecified addresses are not allowed',
  },
  {
    check: (a, b) => a === IPV4_OCTET_CGN && b >= IPV4_CGN_LOW && b <= IPV4_CGN_HIGH,
    reason: 'Carrier-grade NAT addresses are not allowed',
  },
  {
    check: (a, b) =>
      a === IPV4_OCTET_BENCHMARK && (b === IPV4_BENCHMARK_18 || b === IPV4_BENCHMARK_19),
    reason: 'Benchmarking addresses are not allowed',
  },
  {
    check: (a) => a >= IPV4_MULTICAST_LOW && a <= IPV4_MULTICAST_HIGH,
    reason: 'Multicast addresses are not allowed',
  },
  {
    check: (a) => a >= IPV4_RESERVED_LOW,
    reason: 'Reserved addresses are not allowed',
  },
];

const OBFUSCATED_IP_REASONS = [
  { test: (h) => /^0x[0-9a-f]+$/i.test(h), reason: 'Obfuscated IP addresses are not allowed' },
  { test: (h) => /^0[0-7]+$/.test(h), reason: 'Obfuscated IP addresses are not allowed' },
  { test: (h) => /^\d{8,10}$/.test(h), reason: 'Obfuscated IP addresses are not allowed' },
];

const IPV6_BLOCKED_PREFIXES = [
  { prefix: '::1', wrapped: true, reason: 'IPv6 loopback addresses are not allowed' },
  { prefix: 'fe80', wrapped: false, reason: 'IPv6 link-local addresses are not allowed' },
  { prefix: '::ffff:', wrapped: true, reason: 'IPv4-mapped IPv6 addresses are not allowed' },
  { prefix: 'fc', wrapped: true, reason: 'IPv6 unique local addresses are not allowed' },
  { prefix: 'fd', wrapped: true, reason: 'IPv6 unique local addresses are not allowed' },
];

function parseUrl(urlStr) {
  try {
    return new URL(urlStr);
  } catch {
    return null;
  }
}

function isAllowedProtocol(protocol) {
  return /^https?:$/i.test(protocol);
}

function findBlockedIpv4Range(a, b) {
  for (const range of IPV4_BLOCKED_RANGES) {
    if (range.check(a, b)) return range.reason;
  }
  return null;
}

function isBlockedIpv6Hostname(hostname) {
  for (const entry of IPV6_BLOCKED_PREFIXES) {
    if (entry.wrapped) {
      if (hostname === `[${entry.prefix}]`) return entry.reason;
      if (hostname.startsWith(`[${entry.prefix}`)) return entry.reason;
    } else if (hostname === entry.prefix || hostname.startsWith(entry.prefix)) {
      return entry.reason;
    }
  }
  return null;
}

function findObfuscatedIpReason(hostname) {
  for (const entry of OBFUSCATED_IP_REASONS) {
    if (entry.test(hostname)) return entry.reason;
  }
  return null;
}

/**
 * Check whether a URL is safe for server-side fetching (SSRF protection).
 * Blocks loopback, link-local, RFC1918, and cloud metadata IP ranges.
 * Returns an object with `safe` (boolean) and `reason` (string) if unsafe.
 *
 * @param {string} urlStr - The URL to validate
 * @returns {{ safe: boolean, reason?: string }}
 */
export function isSafeOutboundUrl(urlStr) {
  const parsed = parseUrl(urlStr);
  if (!parsed) return { safe: false, reason: 'Invalid URL' };

  if (!isAllowedProtocol(parsed.protocol)) {
    return { safe: false, reason: 'Only http: and https: URLs are allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: 'Connection to internal hostnames is not allowed' };
  }

  const ipMatch = hostname.match(IPV4_PATTERN);
  if (ipMatch) {
    const a = Number(ipMatch[1]);
    const b = Number(ipMatch[2]);
    const reason = findBlockedIpv4Range(a, b);
    if (reason) return { safe: false, reason };
  }

  const ipv6Reason = isBlockedIpv6Hostname(hostname);
  if (ipv6Reason) return { safe: false, reason: ipv6Reason };

  const obfuscatedReason = findObfuscatedIpReason(hostname);
  if (obfuscatedReason) return { safe: false, reason: obfuscatedReason };

  return { safe: true };
}

/**
 * Common validation schemas for API inputs
 */

export const ValidationSchemas = {
  // Authentication
  loginCredentials: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),

  signupCredentials: z.object({
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
    name: z
      .string()
      .min(1, 'Name is required')
      .max(NAME_MAX_LENGTH, `Name must be less than ${NAME_MAX_LENGTH} characters`),
  }),

  // Password reset
  passwordReset: z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
  }),

  // Profile updates
  profileUpdate: z.object({
    name: z
      .string()
      .min(1, 'Name is required')
      .max(100, 'Name must be less than 100 characters')
      .optional(),
    email: z.string().email('Invalid email address').optional(),
  }),

  // API keys
  apiKeyCreate: z.object({
    name: z.string().min(1, 'Key name is required').max(100),
    scopes: z.array(z.string()).optional(),
  }),

  // Connection/integration settings
  connectionCreate: z.object({
    name: z.string().min(1, 'Connection name is required').max(100),
    type: z.enum(['openai', 'anthropic', 'ollama', 'custom']),
    config: z.record(z.any()),
  }),

  // Search queries
  searchQuery: z.object({
    q: z.string().min(1, 'Search query is required').max(1000),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  }),
};

/**
 * Validate input against a schema
 * @param {z.ZodSchema} schema - The Zod schema to validate against
 * @param {unknown} input - The input to validate
 * @returns {Object} { valid: boolean, data?: validated data, errors?: validation errors }
 */
export function validateInput(schema, input) {
  try {
    const data = schema.parse(input);
    return { valid: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.issues.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return { valid: false, errors };
    }
    return {
      valid: false,
      errors: [{ field: 'unknown', message: 'Validation failed' }],
    };
  }
}

/**
 * Middleware to validate request body
 * @param {Request} req - The incoming request
 * @param {z.ZodSchema} schema - The Zod schema to validate against
 * @returns {Object|null} Parsed data if valid, error object if invalid
 */
export async function validateRequestBody(req, schema) {
  try {
    const body = await req.json();
    return validateInput(schema, body);
  } catch {
    return {
      valid: false,
      errors: [{ field: 'body', message: 'Invalid JSON' }],
    };
  }
}
