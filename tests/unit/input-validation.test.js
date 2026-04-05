import { describe, it, expect } from 'vitest';
import { ValidationSchemas, validateInput, validateRequestBody } from '../../src/utils/validation.js';

describe('Input Validation Service', () => {
  describe('validateInput', () => {
    it('validates valid login credentials', () => {
      const input = {
        email: 'user@example.com',
        password: 'password123',
      };

      const result = validateInput(ValidationSchemas.loginCredentials, input);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual(input);
    });

    it('rejects invalid email', () => {
      const input = {
        email: 'not-an-email',
        password: 'password123',
      };

      const result = validateInput(ValidationSchemas.loginCredentials, input);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors[0].field).toBe('email');
    });

    it('validates signup credentials', () => {
      const input = {
        email: 'user@example.com',
        password: 'securepassword',
        name: 'John Doe',
      };

      const result = validateInput(ValidationSchemas.signupCredentials, input);

      expect(result.valid).toBe(true);
    });

    it('rejects password shorter than 8 characters', () => {
      const input = {
        email: 'user@example.com',
        password: 'short',
        name: 'John Doe',
      };

      const result = validateInput(ValidationSchemas.signupCredentials, input);

      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('password');
    });

    it('validates profile updates with optional fields', () => {
      const input = {
        name: 'Jane Doe',
      };

      const result = validateInput(ValidationSchemas.profileUpdate, input);

      expect(result.valid).toBe(true);
    });

    it('validates API key creation', () => {
      const input = {
        name: 'Production API Key',
        scopes: ['read', 'write'],
      };

      const result = validateInput(ValidationSchemas.apiKeyCreate, input);

      expect(result.valid).toBe(true);
    });

    it('validates search query', () => {
      const input = {
        q: 'machine learning',
        limit: 10,
        offset: 0,
      };

      const result = validateInput(ValidationSchemas.searchQuery, input);

      expect(result.valid).toBe(true);
    });

    it('rejects empty search query', () => {
      const input = {
        q: '',
        limit: 10,
      };

      const result = validateInput(ValidationSchemas.searchQuery, input);

      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('q');
    });
  });

  describe('validateRequestBody', () => {
    it('validates valid JSON request body', async () => {
      const req = new Request('http://localhost/api/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'password123',
        }),
      });

      const result = await validateRequestBody(req, ValidationSchemas.loginCredentials);

      expect(result.valid).toBe(true);
      expect(result.data.email).toBe('user@example.com');
    });

    it('handles invalid JSON gracefully', async () => {
      const req = new Request('http://localhost/api/login', {
        method: 'POST',
        body: 'not valid json',
      });

      const result = await validateRequestBody(req, ValidationSchemas.loginCredentials);

      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('body');
    });

    it('returns validation errors for invalid data', async () => {
      const req = new Request('http://localhost/api/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'short',
          name: 'John Doe',
        }),
      });

      const result = await validateRequestBody(req, ValidationSchemas.signupCredentials);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });
});
