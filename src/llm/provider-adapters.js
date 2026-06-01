import {
  decodeDataUrl,
  normalizeToolParameters,
  normalizeToolChoice,
  contentToText,
} from './provider-adapters-utils.js';
import { buildGooglePayload } from './provider-adapters-google.js';

// Re-export everything from sub-modules for backward compatibility
export {
  normalizeToolParameters,
  convertJsonSchemaToOpenApiSchema,
  isEmptyObjectSchema,
  normalizeToolChoice,
} from './provider-adapters-utils.js';
export { buildGooglePayload } from './provider-adapters-google.js';

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
          source: { type: 'base64', media_type: dataUrl.mimeType, data: dataUrl.data },
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
          source: { type: 'base64', media_type: decoded.mimeType, data: decoded.data },
          title: part.file?.filename || 'attachment.pdf',
        });
      } else if (decoded.mimeType.startsWith('text/')) {
        blocks.push({
          type: 'document',
          source: { type: 'text', media_type: decoded.mimeType, data: '' },
          title: part.file?.filename || 'attachment.txt',
        });
      }
    }
  }
  return blocks;
}

function buildAnthropicTools(tools = [], normalize = normalizeToolParameters) {
  const anthropicTools = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (tool?.type !== 'function') continue;
    const fn = tool.function || {};
    const name = String(fn.name || '').trim();
    if (!name) continue;
    anthropicTools.push({
      name,
      description: String(fn.description || ''),
      input_schema: normalize(fn.parameters),
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

export function buildAnthropicPayload(messages, options = {}) {
  const normalize = options.normalizeToolParameters || normalizeToolParameters;
  const payload = {
    model: options.model,
    max_tokens: options.maxTokens || 4096,
    messages: [],
  };
  const systemTexts = [];

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
        const input =
          typeof rawArgs === 'string'
            ? (() => {
                try {
                  return JSON.parse(rawArgs);
                } catch {
                  return rawArgs;
                }
              })()
            : (rawArgs ?? {});
        blocks.push({
          type: 'tool_use',
          id: String(call?.id || crypto.randomUUID()),
          name,
          input,
        });
      }
      if (!blocks.length) continue;
      payload.messages.push({ role: 'assistant', content: blocks });
      continue;
    }
    if (role === 'tool') {
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
      payload.messages.push({ role: 'user', content: [{ type: 'text', text }] });
    }
  }

  if (systemTexts.length) {
    payload.system = systemTexts.join('\n\n');
  }

  const normalizedToolChoice = normalizeToolChoice(options.toolChoice);
  const anthropicTools =
    normalizedToolChoice?.type === 'none'
      ? undefined
      : buildAnthropicTools(options.tools, normalize);
  if (anthropicTools) {
    payload.tools = anthropicTools;
  }
  const anthropicToolChoice =
    normalizedToolChoice?.type === 'none'
      ? undefined
      : buildAnthropicToolChoice(normalizedToolChoice);
  if (anthropicToolChoice) {
    payload.tool_choice = anthropicToolChoice;
  }

  return payload;
}

export function buildProviderRequest({
  providerFamily,
  baseUrl,
  modelId,
  messages,
  options = {},
  stream = true,
  normalizeToolParameters: normalize = normalizeToolParameters,
}) {
  const family = String(providerFamily || 'openai').toLowerCase();
  const normalizedBaseUrl = String(baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');

  if (family === 'google') {
    return {
      url: `${normalizedBaseUrl}/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse`,
      payload: buildGooglePayload(messages, {
        ...options,
        stream,
        model: modelId,
        normalizeToolParameters: normalize,
      }),
      headers: {},
    };
  }

  if (family === 'anthropic') {
    const anthropicBaseUrl = normalizedBaseUrl.endsWith('/v1')
      ? normalizedBaseUrl
      : `${normalizedBaseUrl}/v1`;
    return {
      url: `${anthropicBaseUrl}/messages`,
      payload: {
        ...buildAnthropicPayload(messages, {
          ...options,
          model: modelId,
          normalizeToolParameters: normalize,
        }),
        stream: stream !== false,
      },
      headers: { 'anthropic-version': '2023-06-01' },
    };
  }

  return {
    url: `${normalizedBaseUrl}/chat/completions`,
    payload: {
      model: modelId,
      messages,
      stream: stream !== false,
      ...(Array.isArray(options.tools) && options.tools.length
        ? { tools: options.tools, tool_choice: options.toolChoice }
        : {}),
      ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
    },
    headers: {},
  };
}
