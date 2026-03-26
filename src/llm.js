import { getAllOpenAIConnectionConfigs, buildConnectionHeaders } from './llm/connections.js';
import { buildProviderId, normalizeProviderFamily, parseModelId, parseProviderId } from './llm/provider-registry.js';
import { buildProviderRequest } from './llm/provider-adapters.js';
export { SseLineParser, parseSseChunk } from './llm/stream-parser.js';

export async function streamLLM(env, model, messages, options = {}) {
  if (!model) throw new Error('Model is required');
  const { tools, toolChoice, stream = true, userId = '', userRole = 'member' } = options || {};
  const LLM_CONNECT_TIMEOUT_MS = 30000;

  if (model.startsWith('@cf/')) {
    throw new Error('Workers AI models are disabled');
  }

  let parsed = parseModelId(model);
  let primaryConn = null;
  let providerInfo = null;

  if (!parsed) {
    const enabledConnections = await getAllOpenAIConnectionConfigs(env, { userId, userRole });
    if (enabledConnections.length === 0) {
      throw new Error('No provider connection configured');
    }
    if (enabledConnections.length > 1) {
      throw new Error('Model id must include provider prefix when multiple providers are enabled');
    }
    primaryConn = enabledConnections[0];
    parsed = { providerId: buildProviderId(primaryConn), modelId: model };
  } else {
    providerInfo = parseProviderId(parsed.providerId);
    if (!providerInfo?.connectionId) {
      throw new Error('Invalid provider id');
    }

    const allConnections = await getAllOpenAIConnectionConfigs(env, { includeDisabled: true, userId, userRole });
    primaryConn = allConnections.find((conn) => {
      if (String(conn.id) !== providerInfo.connectionId) return false;
      const family = normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai';
      return family === providerInfo.providerFamily;
    });
  }

  if (!primaryConn) {
    throw new Error('No matching provider connection configured');
  }
  if (primaryConn.enabled === false) {
    throw new Error('Provider connection is disabled');
  }

  const providerFamily = normalizeProviderFamily(primaryConn.providerFamily || primaryConn.providerType) || 'openai';
  const baseUrl = (primaryConn.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const headers = {
    ...buildConnectionHeaders(primaryConn),
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  const request = buildProviderRequest({
    providerFamily,
    baseUrl,
    modelId: parsed.modelId,
    messages,
    options: {
      tools,
      toolChoice,
      maxTokens: options.maxTokens,
    },
    stream,
  });
  const url = request.url;
  const payload = request.payload;
  Object.assign(headers, request.headers || {});

  let response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_CONNECT_TIMEOUT_MS);
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error('LLM request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

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

  if (stream === false) {
    return response.json();
  }

  return response.body;
}
