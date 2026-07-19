import { HTTP_STATUS } from '../shared/http-status.js';
import { HttpError } from './http-errors.js';

export class NotFoundError extends HttpError {
  constructor(message = 'Not found', details = null) {
    super(message, HTTP_STATUS.NOT_FOUND, 'not_found', details);
  }
}
