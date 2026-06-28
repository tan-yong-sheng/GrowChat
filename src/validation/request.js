import { ValidationError } from '../errors/http-errors.js';

export function parseJsonBody(req) {
  return req.json().catch(() => {
    throw new ValidationError('Invalid JSON body');
  });
}

function validateStringConstraints(normalized, message, constraints) {
  const { minLength, maxLength, allowEmpty } = constraints;
  if (!allowEmpty && normalized.length < minLength) {
    throw new ValidationError(message);
  }
  if (maxLength != null && normalized.length > maxLength) {
    throw new ValidationError(message);
  }
}

export function requireString(value, message, options = {}) {
  if (typeof value !== 'string') {
    throw new ValidationError(message);
  }
  const trim = options?.trim !== false;
  const minLength = options?.minLength ?? 1;
  const maxLength = options?.maxLength ?? null;
  const allowEmpty = options?.allowEmpty === true;
  const normalized = trim ? value.trim() : value;
  validateStringConstraints(normalized, message, { minLength, maxLength, allowEmpty });
  return normalized;
}

export function optionalString(value, { trim = true, maxLength = null, lowercase = false } = {}) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  let normalized = String(value);
  if (trim) normalized = normalized.trim();
  if (lowercase) normalized = normalized.toLowerCase();
  if (maxLength != null) normalized = normalized.slice(0, maxLength);
  return normalized;
}

export function requireBoolean(value, message) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(message);
  }
  return value;
}

export function requirePlainObject(value, message) {
  const ok = typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!ok) {
    throw new ValidationError(message);
  }
  return value;
}

export function parsePositiveInt(
  value,
  message,
  { min = 1, max = Number.MAX_SAFE_INTEGER, allowZero = false } = {}
) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) {
    throw new ValidationError(message);
  }
  const parsed = Number.parseInt(raw, 10);
  if ((!allowZero && parsed < min) || parsed > max) {
    throw new ValidationError(message);
  }
  return parsed;
}

export function parsePagination(
  url,
  { defaultLimit = 20, maxLimit = 100, defaultOffset = 0 } = {}
) {
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');
  const limit =
    limitParam == null
      ? defaultLimit
      : parsePositiveInt(
          limitParam,
          `Query parameter "limit" must be a positive integer between 1 and ${maxLimit}`,
          {
            min: 1,
            max: maxLimit,
          }
        );
  const offset =
    offsetParam == null
      ? defaultOffset
      : parsePositiveInt(offsetParam, 'Query parameter "offset" must be a non-negative integer', {
          min: 0,
          allowZero: true,
        });
  return { limit, offset };
}

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@([^\s@]+\.[^\s@]+|localhost)$/;
  return emailRegex.test(email);
}

export function validateEmail(value, message = 'Invalid email format') {
  if (!isValidEmail(value)) {
    throw new ValidationError(message);
  }
  return value;
}
