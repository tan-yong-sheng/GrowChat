/**
 * Admin Panel Router
 *
 * Admin configuration and tool management endpoints
 * All endpoints require admin authorization
 */

import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { authorize, logAuditEvent } from '../utils/authorize.js';
import { getConfigBool, getConfigValue, setConfigValue } from '../utils/app-config.js';
import { ATTACHMENT_CAP_TYPES, MODEL_ATTACHMENT_CAPS_KEY } from '../chat/attachments.js';
import { buildConnectionHeaders, buildEnvOpenAIConnections, discoverConnectionModels, ensureConnectionId, extractConnectionModelId, getConnectionApiType, getConnectionDefaultBaseUrl, getEnvOpenAIOverrides, isConnectionUrlRequired, normalizeConnectionManualModels } from '../llm/connections.js';
import { normalizeProviderFamily } from '../llm/provider-registry.js';
import { MCP_PROTOCOL_VERSION } from '../mcp/client.js';
import {
  buildAuthorizationUrl,
  discoverAuthorizationMetadata,
  isValidHttpUrl,
  loadToolServers,
  mergeToolServer,
  mergeToolSpecs,
  normalizeAuthType,
  normalizeAttachmentCaps,
  normalizeBaseUrl,
  normalizeHeaders,
  normalizeModelId,
  normalizeTokenAuthMethod,
  parseHeadersForRequest,
  randomString,
  redactToolServer,
  saveToolServers,
  selectTokenAuthMethod,
  sha256Base64Url,
} from '../admin/tool-servers.js';
import { mcpNotify, mcpRequest } from '../mcp/client.js';

/**
 * Admin Router Handler
 */
export async function adminRouter(req, env, ctx, user, path) {
  if (!path.startsWith('/api/admin/')) return null;

  let requiredPermission = 'admin.user.read';
  if (path === '/api/admin/config' && req.method === 'PUT') {
    requiredPermission = 'admin.user.write';
  }
  if (path === '/api/admin/model-attachment-caps') {
    requiredPermission = 'admin.rbac.admin';
  }
  if (path === '/api/admin/openai/connections' || path === '/api/admin/openai/connections/test' || path === '/api/admin/openai/env') {
    requiredPermission = 'admin.rbac.admin';
  }
  if (
    path === '/api/admin/tool-servers' ||
    path === '/api/admin/tool-servers/test' ||
    path === '/api/admin/tool-servers/oauth/start' ||
    path === '/api/admin/tool-servers/oauth/callback'
  ) {
    requiredPermission = 'admin.rbac.admin';
  }
  const skipAuth = path === '/api/admin/tool-servers/oauth/callback';
  if (!skipAuth) {
    const authDecision = await authorize(env, user, { action: requiredPermission });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }
  }

  const db = createDB(env.DB);

  // GET /api/admin/config - Fetch admin configuration
  if (req.method === 'GET' && path === '/api/admin/config') {
    try {
      const publicRegistration = await getConfigBool(db, 'public_registration', true);
      const registrationStatusRaw = await getConfigValue(db, 'public_registration_status', 'pending');
      const defaultModelIdRaw = await getConfigValue(db, 'default_model_id', null);
      const registrationStatus = String(registrationStatusRaw || 'pending').trim().toLowerCase() === 'active'
        ? 'active'
        : 'pending';
      const defaultModelId = defaultModelIdRaw ? String(defaultModelIdRaw).trim() : null;
      return json(req, {
        public_registration: publicRegistration,
        public_registration_status: registrationStatus,
        default_model_id: defaultModelId || null
      });
    } catch (err) {
      console.error('Admin config fetch failed:', err);
      return error(req, 'Failed to fetch admin config', 500);
    }
  }

  // PUT /api/admin/config - Update admin configuration
  if (req.method === 'PUT' && path === '/api/admin/config') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const hasPublicRegistration = body.public_registration !== undefined;
    const hasRegistrationStatus = body.public_registration_status !== undefined;
    const hasDefaultModel = body.default_model_id !== undefined;

    if (!hasPublicRegistration && !hasRegistrationStatus && !hasDefaultModel) {
      return error(req, 'No config changes provided', 400);
    }

    if (hasPublicRegistration && typeof body.public_registration !== 'boolean') {
      return error(req, 'public_registration must be a boolean', 400);
    }

    let normalizedRegistrationStatus = null;
    if (hasRegistrationStatus) {
      if (typeof body.public_registration_status !== 'string') {
        return error(req, 'public_registration_status must be a string', 400);
      }
      normalizedRegistrationStatus = String(body.public_registration_status).trim().toLowerCase();
      if (!['active', 'pending'].includes(normalizedRegistrationStatus)) {
        return error(req, 'public_registration_status must be "active" or "pending"', 400);
      }
    }

    let normalizedDefaultModel = null;
    if (hasDefaultModel) {
      if (body.default_model_id === null || body.default_model_id === '') {
        normalizedDefaultModel = '';
      } else if (typeof body.default_model_id !== 'string') {
        return error(req, 'default_model_id must be a string or null', 400);
      } else {
        normalizedDefaultModel = String(body.default_model_id).trim();
        if (!normalizedDefaultModel) normalizedDefaultModel = '';
        if (normalizedDefaultModel.length > 200 || /\s/.test(normalizedDefaultModel)) {
          return error(req, 'default_model_id is invalid', 400);
        }
      }
    }

    try {
      if (hasPublicRegistration) {
        await setConfigValue(db, 'public_registration', body.public_registration ? 'true' : 'false');
      }
      if (hasRegistrationStatus) {
        await setConfigValue(db, 'public_registration_status', normalizedRegistrationStatus);
      }
      if (hasDefaultModel) {
        await setConfigValue(db, 'default_model_id', normalizedDefaultModel);
      }
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'admin_config_updated',
        resource_type: 'admin',
        resource_id: 'config'
      });
      return json(req, {
        public_registration: hasPublicRegistration ? body.public_registration : undefined,
        public_registration_status: hasRegistrationStatus ? normalizedRegistrationStatus : undefined,
        default_model_id: hasDefaultModel ? (normalizedDefaultModel || null) : undefined
      });
    } catch (err) {
      console.error('Admin config update failed:', err);
      return error(req, 'Failed to update admin config', 500);
    }
  }

  // GET /api/admin/model-attachment-caps - Fetch per-model attachment capabilities
  if (req.method === 'GET' && path === '/api/admin/model-attachment-caps') {
    try {
      const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
      let caps = {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          caps = parsed;
        }
      } catch {
        caps = {};
      }
      return json(req, {
        caps,
        supported_types: ATTACHMENT_CAP_TYPES,
      });
    } catch (err) {
      console.error('Attachment caps fetch failed:', err);
      return error(req, 'Failed to fetch attachment caps', 500);
    }
  }

  // PUT /api/admin/model-attachment-caps - Update per-model attachment capabilities
  if (req.method === 'PUT' && path === '/api/admin/model-attachment-caps') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const replaceCaps = body.caps && typeof body.caps === 'object' && !Array.isArray(body.caps);
    const updates = Array.isArray(body.updates) ? body.updates : [];
    const remove = Array.isArray(body.remove) ? body.remove : [];

    if (!replaceCaps && !updates.length && !remove.length) {
      return error(req, 'No attachment cap changes provided', 400);
    }

    try {
      if (replaceCaps) {
        const nextCaps = {};
        for (const [modelId, entry] of Object.entries(body.caps)) {
          const normalizedId = normalizeModelId(modelId);
          if (!normalizedId) continue;
          const attachmentsInput = entry?.attachments ?? entry;
          const attachments = normalizeAttachmentCaps(attachmentsInput);
          nextCaps[normalizedId] = {
            ...(entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}),
            attachments,
            updated_at: Date.now(),
          };
        }
        await setConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, JSON.stringify(nextCaps));
        await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'attachment_caps_replaced',
          resource_type: 'admin',
          resource_id: 'model-attachment-caps',
        });
        return json(req, { caps: nextCaps });
      }

      const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
      let caps = {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          caps = parsed;
        }
      } catch {
        caps = {};
      }

      for (const update of updates) {
        const modelId = normalizeModelId(update?.model_id);
        if (!modelId) {
          throw new Error('model_id is required');
        }
        const patch = normalizeAttachmentCaps(update?.attachments, { allowNull: true });
        const current = caps[modelId] && typeof caps[modelId] === 'object' ? caps[modelId] : {};
        const nextAttachments = { ...(current.attachments || {}) };
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) {
            delete nextAttachments[key];
          } else {
            nextAttachments[key] = value;
          }
        }
        caps[modelId] = {
          ...current,
          attachments: nextAttachments,
          updated_at: Date.now(),
        };
      }

      for (const id of remove) {
        const normalizedId = normalizeModelId(id);
        if (!normalizedId) continue;
        delete caps[normalizedId];
      }

      await setConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, JSON.stringify(caps));
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'attachment_caps_updated',
        resource_type: 'admin',
        resource_id: 'model-attachment-caps',
      });

      return json(req, { caps });
    } catch (err) {
      return error(req, err?.message || 'Invalid attachment cap data', 400);
    }
  }

  // GET /api/admin/openai/connections - List OpenAI connections
  if (req.method === 'GET' && path === '/api/admin/openai/connections') {
    try {
      const envConnections = buildEnvOpenAIConnections(env);
      const envOverrides = await getEnvOpenAIOverrides(env);
      envConnections.forEach((conn) => {
        const override = envOverrides.get(conn.id);
        if (override === false) conn.enabled = false;
      });
      let manualConnections = [];
      const raw = await getConfigValue(db, 'openai_connections', '[]');
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          manualConnections = parsed.map((conn, index) => ({
            ...conn,
            id: ensureConnectionId(conn, index),
            providerType: String(conn?.providerType || 'openai-compatible').toLowerCase(),
            providerFamily: normalizeProviderFamily(conn?.providerType || conn?.providerFamily) || 'openai',
            readOnly: false,
            source: 'config',
            enabled: conn?.enabled !== false,
          }));
        }
      } catch {
        manualConnections = [];
      }
      const enabledRaw = await getConfigValue(db, 'openai_enabled', 'true');
      const enabled = String(enabledRaw).toLowerCase() !== 'false';

      return json(req, {
        enabled,
        connections: [...envConnections, ...manualConnections]
      });
    } catch (err) {
      console.error('OpenAI connections fetch failed:', err);
      return error(req, 'Failed to fetch connections', 500);
    }
  }

  // POST /api/admin/openai/connections/test - Test OpenAI connection
  if (req.method === 'POST' && path === '/api/admin/openai/connections/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const providerType = String(body.providerType || 'openai').toLowerCase();
    const providerFamily = normalizeProviderFamily(body.providerType || body.providerFamily) || 'openai';
    const url = String(body.url || '').trim();
    const requiresUrl = isConnectionUrlRequired(providerType);
    const baseUrl = url || getConnectionDefaultBaseUrl(providerType || providerFamily);
    if (requiresUrl && !url) {
      return error(req, 'Connection URL is required for compatible providers', 400);
    }
    if (!isValidHttpUrl(baseUrl)) {
      return error(req, 'Connection URL must start with http:// or https://', 400);
    }

    const key = String(body.key || '').trim();
    let headers = {};
    try {
      headers = parseHeadersForRequest(body.headers);
    } catch (err) {
      return error(req, err.message || 'Headers must be valid JSON', 400);
    }

    try {
      const testConnection = {
        providerType,
        providerFamily,
        key,
        headers,
        baseUrl: normalizeBaseUrl(baseUrl),
      };
      const discovery = await discoverConnectionModels(testConnection, {
        headers: buildConnectionHeaders(testConnection),
      });
      if (!discovery.items.length) {
        const message = discovery.error?.message || 'No models discovered';
        return error(
          req,
          'Connection failed',
          502,
          { message: String(message).slice(0, 200) }
        );
      }

      return json(req, {
        ok: true,
        message: 'Connection successful',
        discovery_url: discovery.url,
        models: discovery.items.map((item) => {
          const rawId = extractConnectionModelId(item);
          const displayName = String(item?.displayName || item?.display_name || item?.name || item?.id || rawId || '').trim();
          return {
            id: rawId,
            name: displayName.startsWith('models/') ? displayName.slice('models/'.length) : displayName,
          };
        }).filter((item) => Boolean(item.id)),
      });
    } catch (err) {
      return error(req, 'Connection failed', 502, { message: err?.message || String(err) });
    }
  }

  // GET /api/admin/openai/env - Inspect OpenAI env configuration (admin only)
  if (req.method === 'GET' && path === '/api/admin/openai/env') {
    const baseUrl = env.OPENAI_BASE_URL || '';
    const baseUrls = env.OPENAI_API_BASE_URLS || '';
    const hasKey = Boolean(env.OPENAI_API_KEY);
    const hasKeys = Boolean(env.OPENAI_API_KEYS);

    return json(req, {
      openai_base_url: baseUrl || null,
      openai_api_base_urls: baseUrls || null,
      openai_api_key_present: hasKey,
      openai_api_keys_present: hasKeys,
    });
  }

  // GET /api/admin/tool-servers - List tool servers
  if (req.method === 'GET' && path === '/api/admin/tool-servers') {
    try {
      const servers = await loadToolServers(db);
      return json(req, { servers: servers.map(redactToolServer) });
    } catch (err) {
      console.error('Tool servers fetch failed:', err);
      return error(req, 'Failed to fetch tool servers', 500);
    }
  }

  // POST /api/admin/tool-servers/test - Test MCP tool server connection + list tools
  if (req.method === 'POST' && path === '/api/admin/tool-servers/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const url = String(body.url || '').trim();
    if (!url || !isValidHttpUrl(url)) {
      return error(req, 'Server URL must start with http:// or https://', 400);
    }

    let headers = {};
    try {
      headers = parseHeadersForRequest(body.headers);
    } catch (err) {
      return error(req, err.message || 'Headers must be valid JSON', 400);
    }

    const authType = normalizeAuthType(body.auth_type);
    if (authType === 'bearer') {
      const token = String(body.auth_bearer_token || '').trim();
      if (token && !headers.Authorization) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    if (authType === 'basic') {
      const user = String(body.auth_basic_username || '').trim();
      const pass = String(body.auth_basic_password || '');
      if (user && !headers.Authorization) {
        headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
      }
    }

    if (authType === 'oauth') {
      const serverId = String(body.id || '').trim();
      if (!serverId) {
        return error(req, 'Server must be saved before OAuth verification', 400);
      }
      const servers = await loadToolServers(db);
      const server = servers.find((entry) => String(entry.id) === serverId);
      const accessToken = server?.oauth_tokens?.access_token;
      if (!accessToken) {
        return error(req, 'OAuth not connected yet. Click Connect OAuth first.', 400);
      }
      headers.Authorization = `Bearer ${accessToken}`;
    }

    try {
      let sessionId;
      const init = await mcpRequest({
        url,
        headers,
        sessionId,
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'GrowChat', version: '1.0.0' },
        },
      });
      sessionId = init.sessionId;

      const notified = await mcpNotify({
        url,
        headers,
        sessionId,
        method: 'notifications/initialized',
      });
      sessionId = notified.sessionId;

      const toolsResult = await mcpRequest({
        url,
        headers,
        sessionId,
        id: 2,
        method: 'tools/list',
      });

      const tools = Array.isArray(toolsResult.result?.tools)
        ? toolsResult.result.tools
        : [];
      const toolSummaries = tools
        .map((tool) => {
          const parameters = tool?.inputSchema && typeof tool.inputSchema === 'object'
            ? tool.inputSchema
            : (tool?.parameters && typeof tool.parameters === 'object' ? tool.parameters : {});
          return {
            name: String(tool?.name || '').trim(),
            title: String(tool?.title || '').trim(),
            description: String(tool?.description || '').trim(),
            parameters,
          };
        })
        .filter((tool) => tool.name);
      let mergedTools = toolSummaries;

      if (body.id) {
        const servers = await loadToolServers(db);
        const index = servers.findIndex((entry) => String(entry.id) === String(body.id));
        if (index !== -1) {
          mergedTools = mergeToolSpecs(servers[index].tools, toolSummaries);
          servers[index] = {
            ...servers[index],
            tools: mergedTools,
            tools_error: '',
            tools_verified_at: new Date().toISOString(),
          };
          await saveToolServers(db, servers);
        }
      }

      return json(req, {
        ok: true,
        message: 'Connection successful',
        tools: mergedTools,
      });
    } catch (err) {
      if (body?.id) {
        try {
          const servers = await loadToolServers(db);
          const index = servers.findIndex((entry) => String(entry.id) === String(body.id));
          if (index !== -1) {
            servers[index] = {
              ...servers[index],
              tools_error: err?.message || 'Connection failed',
              tools_verified_at: new Date().toISOString(),
            };
            await saveToolServers(db, servers);
          }
        } catch (persistErr) {
          console.warn('Failed to persist tool server error:', persistErr?.message || persistErr);
        }
      }
      return error(req, 'Connection failed', 502, { message: err?.message || String(err) });
    }
  }

  // POST /api/admin/tool-servers/oauth/start - Begin OAuth flow for MCP server
  if (req.method === 'POST' && path === '/api/admin/tool-servers/oauth/start') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const serverId = String(body.id || '').trim();
    if (!serverId) {
      return error(req, 'Server must be saved before OAuth connect', 400);
    }

    const servers = await loadToolServers(db);
    const serverIndex = servers.findIndex((entry) => String(entry.id) === serverId);
    const existingServer = serverIndex === -1 ? null : servers[serverIndex];
    const serverUrl = String(body.url || existingServer?.url || '').trim();
    if (!serverUrl || !isValidHttpUrl(serverUrl)) {
      return error(req, 'Server URL must start with http:// or https://', 400);
    }

    const draftServer = {
      id: serverId,
      name: String(body.name || 'Tool Server').trim() || 'Tool Server',
      url: serverUrl,
      headers: String(body.headers || '').trim(),
      enabled: body.enabled !== false,
      auth_type: 'oauth',
      auth_bearer_token: String(body.auth_bearer_token || '').trim(),
      auth_basic_username: String(body.auth_basic_username || '').trim(),
      auth_basic_password: String(body.auth_basic_password || '').trim(),
      oauth_client_name: String(body.oauth_client_name || '').trim(),
      oauth_scope: String(body.oauth_scope || '').trim(),
      oauth_client_id: String(body.oauth_client_id || '').trim(),
      oauth_client_secret: String(body.oauth_client_secret || '').trim(),
      oauth_token_auth_method: normalizeTokenAuthMethod(body.oauth_token_auth_method) || '',
      oauth_authorization_server: String(body.oauth_authorization_server || '').trim(),
      oauth_token_endpoint: String(body.oauth_token_endpoint || '').trim(),
      oauth_registration_endpoint: String(body.oauth_registration_endpoint || '').trim(),
    };
    const server = existingServer || draftServer;
    const oauthClientName = String(body.oauth_client_name || server.oauth_client_name || 'GrowChat MCP Client').trim();
    const oauthScope = String(body.oauth_scope || server.oauth_scope || '').trim();
    const authServerUrl = String(body.oauth_authorization_server || server.oauth_authorization_server || serverUrl).trim();

    const redirectUri = new URL(req.url).origin + '/api/admin/tool-servers/oauth/callback';

    let metadata = null;
    try {
      metadata = await discoverAuthorizationMetadata(authServerUrl);
    } catch {
      metadata = null;
    }

    let clientId = String(body.oauth_client_id || server.oauth_client_id || '').trim();
    let clientSecret = String(body.oauth_client_secret || server.oauth_client_secret || '').trim();
    let registrationEndpoint = metadata?.registration_endpoint || server.oauth_registration_endpoint || '';

    if (!clientId) {
      if (!registrationEndpoint) {
        return error(req, 'Authorization server does not support dynamic client registration', 400);
      }
      try {
        const registrationPayload = {
          client_name: oauthClientName,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        };
        const registrationRes = await fetch(registrationEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registrationPayload),
        });
        if (!registrationRes.ok) {
          const text = await registrationRes.text().catch(() => '');
          return error(req, 'Client registration failed', 502, { message: text });
        }
        const registrationData = await registrationRes.json();
        clientId = String(registrationData.client_id || '').trim();
        clientSecret = String(registrationData.client_secret || '').trim();
      } catch (err) {
        return error(req, 'Client registration failed', 502, { message: err?.message || String(err) });
      }
    }

    if (!clientId) {
      return error(req, 'OAuth client ID is required', 400);
    }

    const tokenAuthMethod = normalizeTokenAuthMethod(
      body.oauth_token_auth_method || server.oauth_token_auth_method
    ) || selectTokenAuthMethod(metadata?.token_endpoint_auth_methods_supported || [], Boolean(clientSecret));

    const codeVerifier = randomString(64);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state = randomString(32);
    const authorizationEndpoint = metadata?.authorization_endpoint || new URL('/authorize', authServerUrl).toString();
    const tokenEndpoint = metadata?.token_endpoint || new URL('/token', authServerUrl).toString();

    const authorizationUrl = buildAuthorizationUrl({
      authorizationEndpoint,
      clientId,
      redirectUri,
      scope: oauthScope,
      state,
      codeChallenge,
    });

    const persistedServer = {
      ...server,
      auth_type: 'oauth',
      oauth_client_name: oauthClientName,
      oauth_scope: oauthScope,
      oauth_client_id: clientId,
      oauth_client_secret: clientSecret,
      oauth_authorization_server: authServerUrl,
      oauth_token_endpoint: tokenEndpoint,
      oauth_registration_endpoint: registrationEndpoint,
      oauth_token_auth_method: tokenAuthMethod,
      oauth_state: state,
      oauth_code_verifier: codeVerifier,
    };

    if (serverIndex === -1) {
      servers.push({
        ...mergeToolServer(null, persistedServer),
        oauth_state: state,
        oauth_code_verifier: codeVerifier,
      });
    } else {
      servers[serverIndex] = persistedServer;
    }

    await saveToolServers(db, servers);

    return json(req, { ok: true, authorization_url: authorizationUrl.toString() });
  }

  // GET /api/admin/tool-servers/oauth/callback - OAuth redirect handler
  if (req.method === 'GET' && path === '/api/admin/tool-servers/oauth/callback') {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errParam = url.searchParams.get('error');
    if (errParam) {
      return new Response(`Authorization failed: ${errParam}`, { status: 400 });
    }
    if (!code || !state) {
      return new Response('Missing authorization code or state', { status: 400 });
    }

    const servers = await loadToolServers(db);
    const serverIndex = servers.findIndex((entry) => entry?.oauth_state === state);
    if (serverIndex === -1) {
      return new Response('OAuth session not found or expired', { status: 400 });
    }

    const server = servers[serverIndex];
    const tokenEndpoint = server.oauth_token_endpoint || new URL('/token', server.oauth_authorization_server || server.url).toString();
    const clientId = server.oauth_client_id;
    const clientSecret = server.oauth_client_secret;
    const codeVerifier = server.oauth_code_verifier;
    const tokenAuthMethod = normalizeTokenAuthMethod(server.oauth_token_auth_method) || 'client_secret_post';

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: new URL(req.url).origin + '/api/admin/tool-servers/oauth/callback',
      client_id: clientId,
    });

    const headers = new Headers({
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    });

    if (tokenAuthMethod === 'client_secret_basic' && clientSecret) {
      headers.set('Authorization', `Basic ${btoa(`${clientId}:${clientSecret}`)}`);
      params.delete('client_id');
    } else if (tokenAuthMethod === 'client_secret_post' && clientSecret) {
      params.set('client_secret', clientSecret);
    }

    try {
      const tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers,
        body: params,
      });
      if (!tokenRes.ok) {
        const text = await tokenRes.text().catch(() => '');
        return new Response(`Token exchange failed: ${text}`, { status: 400 });
      }
      const tokenData = await tokenRes.json();

      servers[serverIndex] = {
        ...server,
        oauth_tokens: {
          ...tokenData,
          connected_at: new Date().toISOString(),
        },
        oauth_connected_at: new Date().toISOString(),
        oauth_state: null,
        oauth_code_verifier: null,
      };

      await saveToolServers(db, servers);

      return new Response(
        '<html><body><h2>OAuth connected.</h2><p>You can return to GrowChat and click Verify.</p></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    } catch (err) {
      return new Response(`Token exchange failed: ${err?.message || String(err)}`, { status: 400 });
    }
  }

  // PUT /api/admin/tool-servers - Update tool servers
  if (req.method === 'PUT' && path === '/api/admin/tool-servers') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const servers = Array.isArray(body.servers) ? body.servers : [];
    const existing = await loadToolServers(db);
    const existingById = new Map(existing.map((entry) => [String(entry.id), entry]));
    const sanitized = servers
      .map((server) => {
        const merged = mergeToolServer(existingById.get(String(server.id)), server);
        return merged;
      })
      .filter((server) => server.url);

    try {
      await saveToolServers(db, sanitized);
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'tool_servers_updated',
        resource_type: 'admin',
        resource_id: 'tool-servers',
      });
      return json(req, { ok: true, servers: sanitized.map(redactToolServer) });
    } catch (err) {
      console.error('Tool servers update failed:', err);
      return error(req, 'Failed to update tool servers', 500);
    }
  }

  // PUT /api/admin/openai/connections - Update OpenAI connections
  if (req.method === 'PUT' && path === '/api/admin/openai/connections') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
    const connections = Array.isArray(body.connections) ? body.connections : [];
    const envOverridesInput = body.env_overrides && typeof body.env_overrides === 'object'
      ? body.env_overrides
      : {};

    if (connections.length > 100) {
      return error(req, 'Too many connections (max 100)', 400);
    }

    let sanitized;
    try {
      sanitized = connections
        .filter((conn) => !conn?.readOnly && conn?.source !== 'env')
        .map((conn) => {
          const providerType = String(conn.providerType || 'openai').toLowerCase();
          if (!['openai', 'openai-compatible', 'google', 'gemini-compatible', 'anthropic', 'claude-compatible'].includes(providerType)) {
            throw new Error('Provider type must be one of: openai, openai-compatible, google, gemini-compatible, anthropic, claude-compatible');
          }
          const providerFamily = normalizeProviderFamily(providerType || conn.providerFamily) || 'openai';
          const rawUrl = String(conn.url || '').trim();
          const requiresUrl = isConnectionUrlRequired(providerType);
          const url = rawUrl || getConnectionDefaultBaseUrl(providerType || providerFamily);
          if (requiresUrl && !rawUrl) {
            throw new Error('Connection URL is required for compatible providers');
          }
          if (!isValidHttpUrl(url)) {
            throw new Error('Connection URL must start with http:// or https://');
          }
          const key = String(conn.key || '').trim();
          if (key.length > 4096) {
            throw new Error('API key is too long');
          }
          const headers = normalizeHeaders(conn.headers);
          if (headers.length > 4096) {
            throw new Error('Headers are too long');
          }
          const defaultName = providerFamily === 'google'
            ? 'Gemini Compatible'
            : providerFamily === 'anthropic'
              ? 'Claude Compatible'
              : 'OpenAI Compatible';
          return {
            id: conn.id || crypto.randomUUID(),
            name: String(conn.name || defaultName).slice(0, 120),
            url,
            key,
            headers,
            providerType,
            providerFamily,
            apiType: getConnectionApiType(providerType),
            enabled: conn.enabled !== false,
            manualModels: normalizeConnectionManualModels(conn.manualModels),
          };
        })
        .filter(Boolean);
    } catch (err) {
      return error(req, err.message || 'Invalid connection data', 400);
    }

    try {
      await setConfigValue(db, 'openai_connections', JSON.stringify(sanitized));
      await setConfigValue(db, 'openai_enabled', enabled ? 'true' : 'false');
      const envOverrides = {};
      for (const [key, value] of Object.entries(envOverridesInput)) {
        if (!/^env-[a-z0-9-]+$/i.test(String(key))) continue;
        if (value === false) {
          envOverrides[String(key)] = false;
        }
      }
      await setConfigValue(db, 'openai_env_overrides', JSON.stringify(envOverrides));
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'openai_connections_updated',
        resource_type: 'admin',
        resource_id: 'openai-connections',
      });
      return json(req, { ok: true });
    } catch (err) {
      console.error('OpenAI connections update failed:', err);
      return error(req, 'Failed to update connections', 500);
    }
  }

  return null;
}
