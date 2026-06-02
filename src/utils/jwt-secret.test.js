import { describe, expect, it } from 'vitest';
import { getJwtSecret } from './jwt-secret.js';

describe('jwt-secret (re-export)', () => {
  it('re-exports getJwtSecret from shared/jwt-secret', () => {
    expect(getJwtSecret).toBeInstanceOf(Function);
  });
});
