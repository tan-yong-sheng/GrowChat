import { apiFetch } from './request.js';
import { readJsonResponse } from './response.js';

export async function fetchMyPermissions() {
  const res = await apiFetch('/api/users/me/permissions');
  return readJsonResponse(res, `Failed to fetch permissions (${res.status})`);
}

export async function fetchMyRoles() {
  const res = await apiFetch('/api/users/me/roles');
  return readJsonResponse(res, `Failed to fetch roles (${res.status})`);
}
