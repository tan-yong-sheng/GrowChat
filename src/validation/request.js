import { ValidationError } from '../errors/http-errors.js';
import { isValidEmail } from '../utils/rbac.js';

export function parseJsonBody(req) {
  return req.json().catch(() => {
    throw new ValidationError('Invalid JSON body');
  });
}

export function requireString(value, message, { trim = true, minLength = 1, maxLength = null, allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    throw new ValidationError(message);
  }
  const normalized = trim ? value.trim() : value;
  if (!allowEmpty && normalized.length < minLength) {
    throw new ValidationError(message);
  }
  if (maxLength != null && normalized.length > maxLength) {
    throw new ValidationError(message);
  }
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

export function parsePositiveInt(value, message, { min = 1, max = Number.MAX_SAFE_INTEGER, allowZero = false } = {}) {
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

export function parsePagination(url, { defaultLimit = 20, maxLimit = 100, defaultOffset = 0 } = {}) {
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');
  const limit = limitParam == null
    ? defaultLimit
    : parsePositiveInt(limitParam, `Query parameter "limit" must be a positive integer between 1 and ${maxLimit}`, {
      min: 1,
      max: maxLimit,
    });
  const offset = offsetParam == null
    ? defaultOffset
    : parsePositiveInt(offsetParam, 'Query parameter "offset" must be a non-negative integer', {
      min: 0,
      allowZero: true,
    });
  return { limit, offset };
}

export function validateEmail(value, message = 'Invalid email format') {
  if (!isValidEmail(value)) {
    throw new ValidationError(message);
  }
  return value;
}
