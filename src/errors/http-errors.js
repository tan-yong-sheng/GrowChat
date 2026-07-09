/* eslint-disable max-classes-per-file */
import { HTTP_STATUS } from '../shared/http-status.js';
export class HttpError extends Error {
  constructor(
    message,
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code = 'http_error',
    details = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends HttpError {
  constructor(message, details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, 'validation_error', details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', details = null) {
    super(message, HTTP_STATUS.UNAUTHORIZED, 'unauthorized', details);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', details = null) {
    super(message, HTTP_STATUS.FORBIDDEN, 'forbidden', details);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found', details = null) {
    super(message, HTTP_STATUS.NOT_FOUND, 'not_found', details);
  }
}

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
