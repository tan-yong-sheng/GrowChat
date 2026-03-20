import { describe, expect, it } from 'vitest';
import { ValidationError, UnauthorizedError, toHttpErrorPayload } from './http-errors.js';

describe('http-errors', () => {
  it('serializes app errors', () => {
    const payload = toHttpErrorPayload(new ValidationError('Bad input', { field: 'name' }));
    expect(payload.status).toBe(400);
    expect(payload.body).toMatchObject({ error: 'validation_error', message: 'Bad input' });
  });

  it('serializes unknown errors', () => {
    const payload = toHttpErrorPayload(new Error('boom'));
    expect(payload.status).toBe(500);
    expect(payload.body.error).toBe('internal_error');
  });

  it('includes standard status codes', () => {
    expect(new UnauthorizedError().statusCode).toBe(401);
  });
});
