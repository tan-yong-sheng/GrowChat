import { HTTP_STATUS } from '../shared/http-status.js';
import { HttpError } from './http-errors.js';

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', details = null) {
    super(message, HTTP_STATUS.FORBIDDEN, 'forbidden', details);
  }
}
