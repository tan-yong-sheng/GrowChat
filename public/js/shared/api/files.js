import { apiFetch } from './request.js';
import { parseApiError, readJsonResponse } from './response.js';

function buildPaginationParams({ limit, offset }) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return params;
}

export async function fetchFiles({ limit = 20, offset = 0, signal } = {}) {
  const params = buildPaginationParams({ limit, offset });
  const res = await apiFetch(`/api/files?${params.toString()}`, { signal });
  return readJsonResponse(res, `Failed to fetch files (${res.status})`);
}

export async function uploadFile(file, chatId = null, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000;
  const externalSignal = options.signal;
  const controller = new AbortController();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }
  }

  const timeoutId = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  const formData = new FormData();
  formData.append('file', file);
  if (chatId) formData.append('chat_id', chatId);

  let res;
  try {
    res = await apiFetch('/api/files/upload', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new Error('Upload timed out', { cause: err });
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!res.ok) {
    return parseApiError(res, `Failed to upload file (${res.status})`);
  }

  return res.json();
}

export async function deleteFile(id) {
  const res = await apiFetch(`/api/files/${id}`, { method: 'DELETE' });
  return readJsonResponse(res, `Failed to delete file (${res.status})`);
}

export async function getFileMetadata(id) {
  const res = await apiFetch(`/api/files/${id}`);
  return readJsonResponse(res, `Failed to get file metadata (${res.status})`);
}

export async function searchFiles({ q = '', limit = 20, offset = 0, signal } = {}) {
  const params = buildPaginationParams({ limit, offset });
  params.set('q', q.trim());

  const res = await apiFetch(`/api/files/search?${params.toString()}`, {
    signal,
  });
  return readJsonResponse(res, `Failed to search files (${res.status})`);
}

export async function getFileContent(id) {
  const res = await apiFetch(`/api/files/${id}/content`);
  return readJsonResponse(res, `Failed to get file content (${res.status})`);
}

export async function getFileBlob(id) {
  const res = await apiFetch(`/api/files/${id}/blob`);
  if (!res.ok) {
    return parseApiError(res, `Failed to get file blob (${res.status})`);
  }
  return res.blob();
}
