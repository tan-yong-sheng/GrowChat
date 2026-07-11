import { getAllOpenAIConnectionConfigs, buildConnectionHeaders } from './llm/connections.js';
import {
  buildProviderId,
  normalizeProviderFamily,
  parseModelId,
  parseProviderId,
} from './llm/provider-registry.js';
import { findMatchingConnection } from './llm/llm-shared.js';
import { buildProviderRequest } from './llm/provider-adapters.js';
export { SseLineParser, parseSseChunk } from './llm/stream-parser.js';

function getConnectTimeoutMs(env) {
  const raw = env?.LLM_CONNECT_TIMEOUT_MS;
  const parsed = Number.parseInt(String(raw || ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 120000;
}

export async function streamLLM(env, model, messages, options = {}) {
  if (!model) throw new Error('Model is required');
  const { tools, toolChoice, stream = true, userId = '', userRole = 'member' } = options || {};
  const LLM_CONNECT_TIMEOUT_MS = getConnectTimeoutMs(env);

  if (model.startsWith('@cf/')) {
    throw new Error('Workers AI models are disabled');
  }

  const { primaryConn, parsed } = await resolvePrimaryConnection(env, model, { userId, userRole });
  assertConnectionEnabled(primaryConn);

  const providerFamily =
    normalizeProviderFamily(primaryConn.providerFamily || primaryConn.providerType) || 'openai';
  const baseUrl = (primaryConn.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const headers = buildStreamRequestHeaders(primaryConn, parsed, {
    providerFamily,
    baseUrl,
    modelId: parsed.modelId,
    messages,
    tools,
    toolChoice,
    stream,
    maxTokens: options.maxTokens,
  });

  const response = await executeStreamRequest({
    url: headers.url,
    requestHeaders: headers.requestHeaders,
    payload: headers.payload,
    timeoutMs: LLM_CONNECT_TIMEOUT_MS,
  });

  await assertStreamResponse(response);
  if (stream === false) return response.json();
  return response.body;
}

async function resolvePrimaryConnection(env, model, { userId, userRole }) {
  const parsed = parseModelId(model);
  if (!parsed) return resolveConnectionByUnqualifiedModel(env, model, { userId, userRole });
  return resolveConnectionByQualifiedModel(env, parsed, { userId, userRole });
}

async function resolveConnectionByUnqualifiedModel(env, model, { userId, userRole }) {
  const enabledConnections = await getAllOpenAIConnectionConfigs(env, { userId, userRole });
  if (enabledConnections.length === 0) {
    throw new Error('No provider connection configured');
  }
  if (enabledConnections.length > 1) {
    throw new Error('Model id must include provider prefix when multiple providers are enabled');
  }
  const primaryConn = enabledConnections[0];
  return {
    primaryConn,
    parsed: { providerId: buildProviderId(primaryConn), modelId: model },
  };
}

async function resolveConnectionByQualifiedModel(env, parsed, { userId, userRole }) {
  const providerInfo = parseProviderId(parsed.providerId);
  if (!providerInfo?.connectionId) {
    throw new Error('Invalid provider id');
  }
  const allConnections = await getAllOpenAIConnectionConfigs(env, {
    includeDisabled: true,
    userId,
    userRole,
  });
  const primaryConn = findMatchingConnection(allConnections, providerInfo);
  return { primaryConn, parsed };
}

function assertConnectionEnabled(primaryConn) {
  if (!primaryConn) {
    throw new Error('No matching provider connection configured');
  }
  if (primaryConn.enabled === false) {
    throw new Error('Provider connection is disabled');
  }
}

function buildStreamRequestHeaders(primaryConn, _parsed, params) {
  const { providerFamily, baseUrl, modelId, messages, tools, toolChoice, stream, maxTokens } = params;
  const requestHeaders = {
    ...buildConnectionHeaders(primaryConn),
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  const request = buildProviderRequest({
    providerFamily,
    baseUrl,
    modelId,
    messages,
    options: { tools, toolChoice, maxTokens },
    stream,
  });
  Object.assign(requestHeaders, request.headers || {});
  return { url: request.url, payload: request.payload, requestHeaders };
}

async function executeStreamRequest({ url, requestHeaders, payload, timeoutMs }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error('LLM request timed out', { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function assertStreamResponse(response) {
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    throw new Error(`LLM request failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `LLM request failed: provider does not support streaming (content-type: ${contentType || 'unknown'}). ` +
        `Response: ${body.slice(0, 200)}`
    );
  }
}
