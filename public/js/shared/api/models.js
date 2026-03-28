import { apiFetch } from './request.js';
import { readJsonResponse } from './response.js';
import { writeModelsCache } from './cache.js';

export async function fetchModels({ signal, cache = 'no-store', cacheBust } = {}) {
  const suffix = cacheBust ? `?t=${encodeURIComponent(cacheBust === true ? Date.now() : cacheBust)}` : '';
  const res = await apiFetch(`/api/models${suffix}`, { signal, cache });
  const data = await readJsonResponse(res, `Failed to fetch models (${res.status})`);
  writeModelsCache(data);
  return data;
}
