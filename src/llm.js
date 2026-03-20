import { getAllOpenAIConnectionConfigs, buildConnectionHeaders } from './llm/connections.js';
import { buildProviderId, normalizeProviderFamily, parseModelId, parseProviderId } from './llm/provider-registry.js';
import { buildProviderRequest } from './llm/provider-adapters.js';
export { SseLineParser, parseSseChunk } from './llm/stream-parser.js';

function decodeDataUrl(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^data:([^;,]+);base64,(.*)$/i);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

function contentToText(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      if (!part) return '';
      if (typeof part === 'string') return part;
      if (part.type === 'text') return String(part.text || '');
      if (part.type === 'tool') return String(part.content || '');
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function contentToGoogleParts(content) {
  const parts = [];
  if (typeof content === 'string') {
    if (content) parts.push({ text: content });
    return parts;
  }

  for (const part of Array.isArray(content) ? content : []) {
    if (!part) continue;
    if (part.type === 'text') {
      if (part.text) parts.push({ text: String(part.text) });
      continue;
    }
    if (part.type === 'image_url') {
      const url = String(part.image_url?.url || '').trim();
      const dataUrl = decodeDataUrl(url);
      if (dataUrl) {
        parts.push({
          inlineData: {
            mimeType: dataUrl.mimeType,
            data: dataUrl.data,
          },
        });
      } else if (url) {
        parts.push({ fileData: { fileUri: url, mimeType: 'image/*' } });
      }
      continue;
    }
    if (part.type === 'file') {
      const fileData = String(part.file?.file_data || '').trim();
      const decoded = decodeDataUrl(fileData);
      if (decoded) {
        parts.push({
          inlineData: {
            mimeType: decoded.mimeType,
            data: decoded.data,
          },
        });
      }
    }
  }

  return parts;
}

function contentToAnthropicBlocks(content) {
  const blocks = [];
  if (typeof content === 'string') {
    if (content) blocks.push({ type: 'text', text: content });
    return blocks;
  }

  for (const part of Array.isArray(content) ? content : []) {
    if (!part) continue;
    if (part.type === 'text') {
      if (part.text) blocks.push({ type: 'text', text: String(part.text) });
      continue;
    }
    if (part.type === 'image_url') {
      const url = String(part.image_url?.url || '').trim();
      const dataUrl = decodeDataUrl(url);
      if (dataUrl) {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: dataUrl.mimeType,
            data: dataUrl.data,
          },
        });
      }
      continue;
    }
    if (part.type === 'file') {
      const fileData = String(part.file?.file_data || '').trim();
      const decoded = decodeDataUrl(fileData);
      if (!decoded) continue;
      if (decoded.mimeType === 'application/pdf') {
        blocks.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: decoded.mimeType,
            data: decoded.data,
          },
          title: part.file?.filename || 'attachment.pdf',
        });
      } else if (decoded.mimeType.startsWith('text/')) {
        blocks.push({
          type: 'document',
          source: {
            type: 'text',
            media_type: decoded.mimeType,
            data: '',
          },
          title: part.file?.filename || 'attachment.txt',
        });
      }
    }
  }

  return blocks;
}

function normalizeToolParameters(input) {
  return convertJsonSchemaToOpenApiSchema(input);
}

function convertJsonSchemaToOpenApiSchema(jsonSchema, isRoot = true) {
  if (jsonSchema == null) {
    return undefined;
  }

  if (isEmptyObjectSchema(jsonSchema)) {
    if (isRoot) {
      return undefined;
    }

    if (typeof jsonSchema === 'object' && jsonSchema.description) {
      return { type: 'object', description: jsonSchema.description };
    }
    return { type: 'object' };
  }

  if (typeof jsonSchema === 'boolean') {
    return { type: 'boolean', properties: {} };
  }

  if (Array.isArray(jsonSchema) || typeof jsonSchema !== 'object') {
    return jsonSchema;
  }

  const {
    type,
    description,
    required,
    properties,
    items,
    allOf,
    anyOf,
    oneOf,
    format,
    const: constValue,
    minLength,
    enum: enumValues,
  } = jsonSchema;

  const result = {};

  if (description) result.description = description;
  if (required) result.required = required;
  if (format) result.format = format;

  if (constValue !== undefined) {
    result.enum = [constValue];
  }

  if (type) {
    if (Array.isArray(type)) {
      const hasNull = type.includes('null');
      const nonNullTypes = type.filter((t) => t !== 'null');
      if (nonNullTypes.length === 0) {
        result.type = 'null';
      } else {
        result.anyOf = nonNullTypes.map((t) => ({ type: t }));
        if (hasNull) {
          result.nullable = true;
        }
      }
    } else {
      result.type = type;
    }
  }

  if (enumValues !== undefined) {
    result.enum = enumValues;
  }

  if (properties != null) {
    result.properties = Object.entries(properties).reduce((acc, [key, value]) => {
      acc[key] = convertJsonSchemaToOpenApiSchema(value, false);
      return acc;
    }, {});
  }

  if (items) {
    result.items = Array.isArray(items)
      ? items.map((item) => convertJsonSchemaToOpenApiSchema(item, false))
      : convertJsonSchemaToOpenApiSchema(items, false);
  }

  if (allOf) {
    result.allOf = allOf.map((item) => convertJsonSchemaToOpenApiSchema(item, false));
  }
  if (anyOf) {
    if (anyOf.some((schema) => typeof schema === 'object' && schema?.type === 'null')) {
      const nonNullSchemas = anyOf.filter(
        (schema) => !(typeof schema === 'object' && schema?.type === 'null')
      );

      if (nonNullSchemas.length === 1) {
        const converted = convertJsonSchemaToOpenApiSchema(nonNullSchemas[0], false);
        if (typeof converted === 'object' && converted) {
          result.nullable = true;
          Object.assign(result, converted);
        }
      } else {
        result.anyOf = nonNullSchemas.map((item) =>
          convertJsonSchemaToOpenApiSchema(item, false)
        );
        result.nullable = true;
      }
    } else {
      result.anyOf = anyOf.map((item) => convertJsonSchemaToOpenApiSchema(item, false));
    }
  }
  if (oneOf) {
    result.oneOf = oneOf.map((item) => convertJsonSchemaToOpenApiSchema(item, false));
  }

  if (minLength !== undefined) {
    result.minLength = minLength;
  }

  return result;
}

function isEmptyObjectSchema(jsonSchema) {
  return (
    jsonSchema != null &&
    typeof jsonSchema === 'object' &&
    jsonSchema.type === 'object' &&
    (jsonSchema.properties == null || Object.keys(jsonSchema.properties).length === 0) &&
    !jsonSchema.additionalProperties
  );
}

function normalizeToolChoice(toolChoice) {
  if (!toolChoice) return undefined;
  if (typeof toolChoice === 'string') {
    const type = toolChoice.toLowerCase();
    if (type === 'auto' || type === 'none' || type === 'required') {
      return { type };
    }
    return undefined;
  }
  const type = String(toolChoice.type || '').toLowerCase();
  if (!type) return undefined;
  if (type === 'auto' || type === 'none' || type === 'required') {
    return { type };
  }
  if (type === 'tool' && (toolChoice.toolName || toolChoice.name || toolChoice.function?.name)) {
    return {
      type: 'tool',
      toolName: String(toolChoice.toolName || toolChoice.name || toolChoice.function?.name),
    };
  }
  if (type === 'function' && (toolChoice.function?.name || toolChoice.name)) {
    return {
      type: 'tool',
      toolName: String(toolChoice.function?.name || toolChoice.name),
    };
  }
  return undefined;
}

function buildToolCallNameMap(messages = []) {
  const map = new Map();
  for (const message of messages || []) {
    if (String(message?.role || '').toLowerCase() !== 'assistant') continue;
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    for (const call of toolCalls) {
      const id = String(call?.id || '').trim();
      const name = String(call?.function?.name || '').trim();
      if (id && name) {
        map.set(id, name);
      }
    }
  }
  return map;
}

function buildGoogleTools(tools = []) {
  const functionDeclarations = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (tool?.type !== 'function') continue;
    const fn = tool.function || {};
    const name = String(fn.name || '').trim();
    if (!name) continue;
    functionDeclarations.push({
      name,
      description: String(fn.description || ''),
      parameters: normalizeToolParameters(fn.parameters),
    });
  }
  return functionDeclarations.length ? [{ functionDeclarations }] : undefined;
}

function buildGoogleToolConfig(toolChoice) {
  const choice = normalizeToolChoice(toolChoice);
  if (!choice) return undefined;
  switch (choice.type) {
    case 'auto':
      return { functionCallingConfig: { mode: 'AUTO' } };
    case 'none':
      return { functionCallingConfig: { mode: 'NONE' } };
    case 'required':
      return { functionCallingConfig: { mode: 'ANY' } };
    case 'tool':
      return {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [choice.toolName],
        },
      };
    default:
      return undefined;
  }
}

function buildAnthropicTools(tools = []) {
  const anthropicTools = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (tool?.type !== 'function') continue;
    const fn = tool.function || {};
    const name = String(fn.name || '').trim();
    if (!name) continue;
    anthropicTools.push({
      name,
      description: String(fn.description || ''),
      input_schema: normalizeToolParameters(fn.parameters),
    });
  }
  return anthropicTools.length ? anthropicTools : undefined;
}

function buildAnthropicToolChoice(toolChoice) {
  const choice = normalizeToolChoice(toolChoice);
  if (!choice) return undefined;
  switch (choice.type) {
    case 'auto':
      return { type: 'auto' };
    case 'required':
      return { type: 'any' };
    case 'tool':
      return { type: 'tool', name: choice.toolName };
    default:
      return undefined;
  }
}

function buildGooglePayload(messages, options = {}) {
  const contents = [];
  const systemTexts = [];
  const toolCallNameMap = buildToolCallNameMap(messages);
  const getThoughtSignature = (call) => {
    const signature =
      call?.providerMetadata?.google?.thoughtSignature ??
      call?.providerMetadata?.vertex?.thoughtSignature ??
      call?.providerOptions?.google?.thoughtSignature ??
      call?.providerOptions?.vertex?.thoughtSignature;
    return signature != null ? String(signature) : undefined;
  };
  for (const message of messages || []) {
    const role = String(message?.role || '').toLowerCase();
    if (role === 'system') {
      const text = contentToText(message.content);
      if (text) systemTexts.push(text);
      continue;
    }
    if (role === 'assistant' && Array.isArray(message?.tool_calls) && message.tool_calls.length) {
      const parts = contentToGoogleParts(message.content);
      for (const call of message.tool_calls) {
        const fn = call?.function || {};
        const name = String(fn.name || '').trim();
        if (!name) continue;
        const rawArgs = fn.arguments;
        const args = typeof rawArgs === 'string'
          ? (() => {
              try { return JSON.parse(rawArgs); } catch { return rawArgs; }
            })()
          : rawArgs ?? {};
        const thoughtSignature = getThoughtSignature(call);
        parts.push({
          functionCall: {
            name,
            args,
          },
          ...(thoughtSignature ? { thoughtSignature } : {}),
        });
      }
      if (!parts.length) continue;
      contents.push({
        role: 'model',
        parts,
      });
      continue;
    }
    if (role === 'tool') {
      const toolName = String(message?.name || toolCallNameMap.get(String(message?.tool_call_id || '')) || 'tool').trim();
      const outputText = contentToText(message.content);
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: {
                name: toolName,
                content: outputText,
              },
            },
          },
        ],
      });
      continue;
    }
    if (role === 'user' || role === 'assistant') {
      const parts = contentToGoogleParts(message.content);
      if (!parts.length) {
        const text = contentToText(message.content);
        if (text) parts.push({ text });
      }
      if (!parts.length) continue;
      contents.push({
        role: role === 'assistant' ? 'model' : 'user',
        parts,
      });
      continue;
    }
    const text = contentToText(message.content);
    if (text) {
      contents.push({ role: 'user', parts: [{ text }] });
    }
  }

  const systemText = systemTexts.join('\n\n').trim();
  const payload = {
    contents,
  };
  if (systemText) {
    payload.systemInstruction = { parts: [{ text: systemText }] };
  }
  const googleTools = buildGoogleTools(options.tools);
  if (googleTools) {
    payload.tools = googleTools;
  }
  const googleToolConfig = buildGoogleToolConfig(options.toolChoice);
  if (googleToolConfig) {
    payload.toolConfig = googleToolConfig;
  }
  if (options.stream !== false) {
    payload.generationConfig = {};
  }
  return payload;
}

function buildAnthropicPayload(messages, options = {}) {
  const payload = {
    model: options.model,
    max_tokens: options.maxTokens || 4096,
    messages: [],
  };
  const systemTexts = [];
  const toolCallNameMap = buildToolCallNameMap(messages);
  for (const message of messages || []) {
    const role = String(message?.role || '').toLowerCase();
    if (role === 'system') {
      const text = contentToText(message.content);
      if (text) systemTexts.push(text);
      continue;
    }
    if (role === 'assistant' && Array.isArray(message?.tool_calls) && message.tool_calls.length) {
      const blocks = contentToAnthropicBlocks(message.content);
      for (const call of message.tool_calls) {
        const fn = call?.function || {};
        const name = String(fn.name || '').trim();
        if (!name) continue;
        const rawArgs = fn.arguments;
        const input = typeof rawArgs === 'string'
          ? (() => {
              try { return JSON.parse(rawArgs); } catch { return rawArgs; }
            })()
          : rawArgs ?? {};
        blocks.push({
          type: 'tool_use',
          id: String(call?.id || crypto.randomUUID()),
          name,
          input,
        });
      }
      if (!blocks.length) continue;
      payload.messages.push({
        role: 'assistant',
        content: blocks,
      });
      continue;
    }
    if (role === 'tool') {
      const toolName = String(message?.name || toolCallNameMap.get(String(message?.tool_call_id || '')) || 'tool').trim();
      const outputText = contentToText(message.content);
      payload.messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: String(message?.tool_call_id || ''),
            content: outputText,
            is_error: Boolean(message?.error),
          },
        ],
      });
      continue;
    }
    if (role === 'user' || role === 'assistant') {
      const blocks = contentToAnthropicBlocks(message.content);
      if (!blocks.length) {
        const text = contentToText(message.content);
        if (text) blocks.push({ type: 'text', text });
      }
      if (!blocks.length) continue;
      payload.messages.push({
        role: role === 'assistant' ? 'assistant' : 'user',
        content: blocks,
      });
      continue;
    }
    const text = contentToText(message.content);
    if (text) {
      payload.messages.push({
        role: 'user',
        content: [{ type: 'text', text }],
      });
    }
  }
  if (systemTexts.length) {
    payload.system = systemTexts.join('\n\n');
  }
  const normalizedToolChoice = normalizeToolChoice(options.toolChoice);
  const anthropicTools = normalizedToolChoice?.type === 'none'
    ? undefined
    : buildAnthropicTools(options.tools);
  if (anthropicTools) {
    payload.tools = anthropicTools;
  }
  const anthropicToolChoice = normalizedToolChoice?.type === 'none'
    ? undefined
    : buildAnthropicToolChoice(normalizedToolChoice);
  if (anthropicToolChoice) {
    payload.tool_choice = anthropicToolChoice;
  }
  return payload;
}

export async function streamLLM(env, model, messages, options = {}) {
  if (!model) throw new Error('Model is required');
  const { tools, toolChoice, stream = true } = options || {};
  const LLM_CONNECT_TIMEOUT_MS = 30000;

  if (model.startsWith('@cf/')) {
    throw new Error('Workers AI models are disabled');
  }

  let parsed = parseModelId(model);
  let primaryConn = null;
  let providerInfo = null;

  if (!parsed) {
    const enabledConnections = await getAllOpenAIConnectionConfigs(env);
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

    const allConnections = await getAllOpenAIConnectionConfigs(env, { includeDisabled: true });
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
      normalizeToolParameters,
    },
    stream,
    normalizeToolParameters,
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

