import { apiFetch } from './request.js';
import { readJsonResponse } from './response.js';

export async function fetchToolServers({ signal, cache = 'no-store' } = {}) {
  const res = await apiFetch('/api/tool-servers', { signal, cache });
  return readJsonResponse(res, `Failed to fetch tool servers (${res.status})`);
}

export async function fetchUserConnections({ signal, cache = 'no-store' } = {}) {
  const res = await apiFetch('/api/users/me/resources/connections', { signal, cache });
  return readJsonResponse(res, `Failed to fetch connections (${res.status})`);
}

export async function createUserConnection(payload) {
  const res = await apiFetch('/api/users/me/resources/connections', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res, `Failed to create connection (${res.status})`);
}

export async function updateUserConnection(id, payload) {
  const res = await apiFetch(`/api/users/me/resources/connections/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res, `Failed to update connection (${res.status})`);
}

export async function deleteUserConnection(id) {
  const res = await apiFetch(`/api/users/me/resources/connections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return readJsonResponse(res, `Failed to delete connection (${res.status})`);
}

export async function testUserConnection(payload) {
  const res = await apiFetch('/api/users/me/resources/connections/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res, `Failed to test connection (${res.status})`);
}

export async function fetchUserMcpServers({ signal, cache = 'no-store' } = {}) {
  const res = await apiFetch('/api/users/me/resources/mcp-servers', { signal, cache });
  return readJsonResponse(res, `Failed to fetch MCP servers (${res.status})`);
}

export async function testUserMcpServer(payload) {
  const res = await apiFetch('/api/users/me/resources/mcp-servers/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res, `Failed to test MCP server (${res.status})`);
}

export async function createUserMcpServer(payload) {
  const res = await apiFetch('/api/users/me/resources/mcp-servers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res, `Failed to create MCP server (${res.status})`);
}

export async function updateUserMcpServer(id, payload) {
  const res = await apiFetch(`/api/users/me/resources/mcp-servers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res, `Failed to update MCP server (${res.status})`);
}

export async function deleteUserMcpServer(id) {
  const res = await apiFetch(`/api/users/me/resources/mcp-servers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return readJsonResponse(res, `Failed to delete MCP server (${res.status})`);
}
