import { z, ZodError } from 'zod';

/**
 * Check whether a URL is safe for server-side fetching (SSRF protection).
 * Blocks loopback, link-local, RFC1918, and cloud metadata IP ranges.
 * Returns an object with `safe` (boolean) and `reason` (string) if unsafe.
 *
 * @param {string} urlStr - The URL to validate
 * @returns {{ safe: boolean, reason?: string }}
 */
export function isSafeOutboundUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { safe: false, reason: 'Invalid URL' };
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    return { safe: false, reason: 'Only http: and https: URLs are allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block common internal hostnames
  const blockedHosts = [
    'localhost',
    'metadata.google.internal',
    'metadata.azure.com',
    '169.254.169.254', // AWS/GCP/Azure metadata
  ];
  if (blockedHosts.includes(hostname)) {
    return { safe: false, reason: 'Connection to internal hostnames is not allowed' };
  }

  // Block IP-based URLs that point to private/reserved ranges
  const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number);
    // 127.0.0.0/8 — Loopback
    if (a === 127) return { safe: false, reason: 'Loopback addresses are not allowed' };
    // 10.0.0.0/8 — RFC1918
    if (a === 10) return { safe: false, reason: 'Private network addresses are not allowed' };
    // 172.16.0.0/12 — RFC1918
    if (a === 172 && b >= 16 && b <= 31)
      return { safe: false, reason: 'Private network addresses are not allowed' };
    // 192.168.0.0/16 — RFC1918
    if (a === 192 && b === 168)
      return { safe: false, reason: 'Private network addresses are not allowed' };
    // 169.254.0.0/16 — Link-local / cloud metadata
    if (a === 169 && b === 254)
      return { safe: false, reason: 'Link-local addresses are not allowed' };
    // 0.0.0.0/8 — Current network
    if (a === 0) return { safe: false, reason: 'Unspecified addresses are not allowed' };
    // 100.64.0.0/10 — Carrier-grade NAT (RFC6598)
    if (a === 100 && b >= 64 && b <= 127)
      return { safe: false, reason: 'Carrier-grade NAT addresses are not allowed' };
    // 198.18.0.0/15 — Benchmarking (RFC2544)
    if (a === 198 && (b === 18 || b === 19))
      return { safe: false, reason: 'Benchmarking addresses are not allowed' };
    // 224.0.0.0/4 — Multicast
    if (a >= 224 && a <= 239) return { safe: false, reason: 'Multicast addresses are not allowed' };
    // 240.0.0.0/4 — Reserved
    if (a >= 240) return { safe: false, reason: 'Reserved addresses are not allowed' };
  }

  // Block IPv6 loopback and link-local (common forms)
  if (hostname === '::1' || hostname === '[::1]') {
    return { safe: false, reason: 'IPv6 loopback addresses are not allowed' };
  }
  if (hostname.startsWith('fe80') || hostname.startsWith('[fe80')) {
    return { safe: false, reason: 'IPv6 link-local addresses are not allowed' };
  }
  // Block IPv6 unique local addresses (fc00::/7)
  if (
    hostname.startsWith('fc') ||
    hostname.startsWith('fd') ||
    hostname.startsWith('[fc') ||
    hostname.startsWith('[fd')
  ) {
    return { safe: false, reason: 'IPv6 unique local addresses are not allowed' };
  }

  // Block hostnames that look like IP addresses with ports or other tricks
  // e.g. 0x7f000001 (hex), 2130706433 (decimal), 017700000001 (octal)
  if (
    /^0x[0-9a-f]+$/i.test(hostname) ||
    /^0[0-7]+$/.test(hostname) ||
    /^\d{8,10}$/.test(hostname)
  ) {
    return { safe: false, reason: 'Obfuscated IP addresses are not allowed' };
  }

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
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  }),

  // Password reset
  passwordReset: z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
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
