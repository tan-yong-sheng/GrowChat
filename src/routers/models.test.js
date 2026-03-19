import { describe, it, expect, vi } from 'vitest';

vi.mock('../utils/openai-connections.js', () => ({
  getAllOpenAIConnectionConfigs: vi.fn().mockResolvedValue([]),
}));

import { modelsRouter } from './models.js';

function makeReq(path, method, headers = {}) {
  return new Request(`https://example.com${path}`, { method, headers });
}

describe('modelsRouter', () => {
  it('returns 304 when If-None-Match matches for /api/models', async () => {
    const env = {};
    const res1 = await modelsRouter(makeReq('/api/models', 'GET'), env, {}, null, '/api/models');
    const etag = res1.headers.get('ETag');
    expect(etag).toBeTruthy();

    const res2 = await modelsRouter(
      makeReq('/api/models', 'GET', { 'If-None-Match': etag }),
      env,
      {},
      null,
      '/api/models'
    );

    expect(res2.status).toBe(304);
  });
});
