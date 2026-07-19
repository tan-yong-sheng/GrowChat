import { HTTP_STATUS } from '../shared/http-status.js';
import { HttpError } from './http-errors.js';

export class ValidationError extends HttpError {
  constructor(message, details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, 'validation_error', details);
  }
}
