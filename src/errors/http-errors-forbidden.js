import { HTTP_STATUS } from '../shared/http-status.js';
import { HttpError } from './http-error-base.js';

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', details = null) {
    super(message, HTTP_STATUS.FORBIDDEN, 'forbidden', details);
  }
}
