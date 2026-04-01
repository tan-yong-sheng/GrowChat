import { apiFetch } from './request.js';
import { readJsonResponse } from './response.js';
import { writeModelsCache } from './cache.js';

export async function fetchModels({
  signal,
  cache = 'no-store',
  cacheBust,
  limit,
  offset,
  provider,
  q,
  includeDisabled = false,
} = {}) {
  const params = new URLSearchParams();
  if (limit !== undefined && limit !== null) params.set('limit', String(limit));
  if (offset !== undefined && offset !== null) params.set('offset', String(offset));
  if (provider) params.set('provider', String(provider));
  if (q !== undefined && q !== null && String(q).trim()) params.set('q', String(q).trim());
  if (includeDisabled) params.set('include_disabled', '1');
  if (cacheBust) params.set('t', String(cacheBust === true ? Date.now() : cacheBust));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/models${suffix}`, { signal, cache });
  const data = await readJsonResponse(res, `Failed to fetch models (${res.status})`);
  writeModelsCache(data);
  return data;
}
