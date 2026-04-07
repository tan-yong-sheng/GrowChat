import { describe, expect, it } from 'vitest';
import { parseApiError } from '../../public/js/shared/api/response.js';

describe('parseApiError', () => {
  it('prefers backend details.message for connection test errors', async () => {
    const res = {
      status: 502,
      json: async () => ({
        error: 'Connection failed',
        details: {
          message: 'Upstream discovery returned 401 Unauthorized',
        },
      }),
    };

    await expect(parseApiError(res, 'Failed to test connection (502)'))
      .rejects
      .toMatchObject({
        message: 'Upstream discovery returned 401 Unauthorized',
        status: 502,
      });
  });
});
