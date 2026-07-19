import { HTTP_STATUS } from '../shared/http-status.js';
import { HttpError } from './http-error-base.js';

export { HttpError };

export function isHttpError(error) {
  return error instanceof HttpError;
}

export function toHttpErrorPayload(error) {
  if (error instanceof HttpError) {
    return {
      status: error.statusCode,
      body: {
        error: error.code,
        message: error.message,
        ...(error.details != null ? { details: error.details } : {}),
      },
    };
  }

  return {
    status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    body: {
      error: 'internal_error',
      message: 'Internal server error',
    },
  };
}

export { ValidationError } from './http-errors-validation.js';
export { UnauthorizedError } from './http-errors-unauthorized.js';
export { ForbiddenError } from './http-errors-forbidden.js';
export { NotFoundError } from './http-errors-not-found.js';
