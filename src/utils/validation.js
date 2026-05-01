import { z, ZodError } from 'zod';

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
