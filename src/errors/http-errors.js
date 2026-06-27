export class HttpError extends Error {
  constructor(message, statusCode = 500, code = 'http_error', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends HttpError {
  constructor(message, details = null) {
    super(message, 400, 'validation_error', details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', details = null) {
    super(message, 401, 'unauthorized', details);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', details = null) {
    super(message, 403, 'forbidden', details);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found', details = null) {
    super(message, 404, 'not_found', details);
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
    status: 500,
    body: {
      error: 'internal_error',
      message: 'Internal server error',
    },
  };
}
