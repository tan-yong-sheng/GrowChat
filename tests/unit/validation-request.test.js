import { describe, it, expect } from 'vitest';
import { isValidEmail, validateEmail } from '../../src/validation/request.js';

describe('isValidEmail', () => {
  it('accepts valid internet domain emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('sam.doe@sub.example.co.uk')).toBe(true);
  });

  it('accepts localhost domain emails', () => {
    expect(isValidEmail('admin@localhost')).toBe(true);
    expect(isValidEmail('test@localhost')).toBe(true);
  });

  it('rejects emails without @', () => {
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('userwithoutat')).toBe(false);
  });

  it('rejects emails without domain part', () => {
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user@.')).toBe(false);
  });

  it('rejects emails with spaces', () => {
    expect(isValidEmail('user name@example.com')).toBe(false);
  });

  it('returns false for null and undefined', () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isValidEmail(123)).toBe(false);
    expect(isValidEmail({})).toBe(false);
    expect(isValidEmail([])).toBe(false);
  });
});

describe('validateEmail', () => {
  it('returns value for valid email', () => {
    expect(validateEmail('user@example.com')).toBe('user@example.com');
  });

  it('throws ValidationError for invalid email', () => {
    expect(() => validateEmail('notanemail')).toThrow('Invalid email format');
  });

  it('returns value for localhost email', () => {
    expect(validateEmail('admin@localhost')).toBe('admin@localhost');
  });
});
