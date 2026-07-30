import { HTTP_STATUS } from '../shared/http-status.js';
import { HttpError } from './http-error-base.js';

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', details = null) {
    super(message, HTTP_STATUS.UNAUTHORIZED, 'unauthorized', details);
  }
}
