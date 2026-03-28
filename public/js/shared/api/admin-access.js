import { getAdminAclAccessPath, getAdminUserAccessPath } from '../admin-acl.js';
import { apiFetch } from './request.js';
import { readJsonResponse } from './response.js';

export async function fetchAdminUserAccess(userId) {
  const res = await apiFetch(getAdminUserAccessPath(userId), { cache: 'no-store' });
  return readJsonResponse(res, `Failed to inspect user access (${res.status})`);
}

export async function fetchAdminConnectionAccess(connectionId) {
  const res = await apiFetch(getAdminAclAccessPath('connections', { resourceId: connectionId }));
  return readJsonResponse(res, `Failed to fetch connection access (${res.status})`);
}

export async function updateAdminConnectionAccess(connectionId, rules = []) {
  const res = await apiFetch(getAdminAclAccessPath('connections', { resourceId: connectionId }), {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  });
  return readJsonResponse(res, `Failed to update connection access (${res.status})`);
}

export async function fetchAdminToolServerAccess(toolServerId) {
  const res = await apiFetch(getAdminAclAccessPath('tool-servers', { resourceId: toolServerId }));
  return readJsonResponse(res, `Failed to fetch MCP server access (${res.status})`);
}

export async function updateAdminToolServerAccess(toolServerId, rules = []) {
  const res = await apiFetch(getAdminAclAccessPath('tool-servers', { resourceId: toolServerId }), {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  });
  return readJsonResponse(res, `Failed to update MCP server access (${res.status})`);
}
