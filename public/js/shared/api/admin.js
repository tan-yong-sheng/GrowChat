import { apiFetch } from './request.js';
import { parseApiError, readJsonResponse } from './response.js';

export async function fetchAdminRbacRoles({ signal, cache = 'no-store' } = {}) {
  const res = await apiFetch('/api/admin/rbac/roles', { signal, cache });
  return readJsonResponse(res, `Failed to fetch admin roles (${res.status})`);
}

export async function createAdminRbacRole(payload) {
  const res = await apiFetch('/api/admin/rbac/roles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res, `Failed to create role (${res.status})`);
}

export async function updateAdminRbacRole(id, payload) {
  const res = await apiFetch(`/api/admin/rbac/roles/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res, `Failed to update role (${res.status})`);
}

export async function deleteAdminRbacRole(id) {
  const res = await apiFetch(`/api/admin/rbac/roles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    return parseApiError(res, `Failed to delete role (${res.status})`);
  }
  return res;
}

export async function fetchAdminUsers({ limit = 200, offset = 0 } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const res = await apiFetch(`/api/admin/users?${params.toString()}`);
  return readJsonResponse(res, `Failed to fetch users (${res.status})`);
}

export async function fetchAdminGroups() {
  const res = await apiFetch('/api/admin/groups');
  return readJsonResponse(res, `Failed to fetch groups (${res.status})`);
}

export async function fetchAdminModels({
  limit = 200,
  offset = 0,
  query = '',
  includeDisabled = true,
  provider = '',
} = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (query) params.set('q', query);
  if (provider && provider !== 'all') params.set('provider', provider);
  if (includeDisabled) params.set('include_disabled', '1');
  const res = await apiFetch(`/api/admin/models?${params.toString()}`);
  return readJsonResponse(res, `Failed to fetch models (${res.status})`);
}

export async function fetchAdminGroup(groupId) {
  const res = await apiFetch(`/api/admin/groups/${encodeURIComponent(groupId)}`);
  return readJsonResponse(res, `Failed to fetch group (${res.status})`);
}

export async function createAdminGroup(payload) {
  const res = await apiFetch('/api/admin/groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res, `Failed to create group (${res.status})`);
}

export async function updateAdminGroup(groupId, payload) {
  const res = await apiFetch(`/api/admin/groups/${encodeURIComponent(groupId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res, `Failed to update group (${res.status})`);
}

export async function deleteAdminGroup(groupId) {
  const res = await apiFetch(`/api/admin/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    return parseApiError(res, `Failed to delete group (${res.status})`);
  }
  return res;
}

export async function addGroupMembers(groupId, userIds = []) {
  const res = await apiFetch(`/api/admin/groups/${encodeURIComponent(groupId)}/users`, {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds }),
  });
  return readJsonResponse(res, `Failed to add group members (${res.status})`);
}

export async function removeGroupMembers(groupId, userIds = []) {
  const res = await apiFetch(`/api/admin/groups/${encodeURIComponent(groupId)}/users`, {
    method: 'DELETE',
    body: JSON.stringify({ user_ids: userIds }),
  });
  return readJsonResponse(res, `Failed to remove group members (${res.status})`);
}

export async function fetchAdminUsage({ signal, cache = 'no-store' } = {}) {
	const res = await apiFetch('/api/admin/usage', { signal, cache });
	return readJsonResponse(res, `Failed to fetch usage metrics (${res.status})`);
}