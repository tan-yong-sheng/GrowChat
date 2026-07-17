// fallow-ignore-file code-duplication
// share the same message-iteration pattern but produce different payload shapes.
// The content-to-parts conversion (AnthropicBlocks vs GoogleParts) and tool-call
// assembly are structurally distinct per provider and cannot be safely shared.

import { randomUUID } from 'node:crypto';

import {
  decodeDataUrl,
  normalizeToolParameters,
  normalizeToolChoice,
  buildToolCallNameMap,
  contentToText,
} from './provider-adapters-utils.js';
import {
  getFunctionName,
  parseFnArguments,
  resolveToolChoiceConfig,
  addSystemContent,
  normalizeMessageRole,
} from './provider-adapters-shared.js';
import { buildGooglePayload } from './provider-adapters-google.js';

function contentToAnthropicBlocks(content) {
  if (typeof content === 'string') return convertStringContentToBlocks(content);
  return convertArrayContentToBlocks(content);
}

function convertStringContentToBlocks(content) {
  return content ? [{ type: 'text', text: content }] : [];
}

function convertArrayContentToBlocks(content) {
  const blocks = [];
  for (const part of Array.isArray(content) ? content : []) {
    if (!part) continue;
    if (part.type === 'text') appendTextBlock(part, blocks);
    else if (part.type === 'image_url') appendImageUrlBlock(part, blocks);
    else if (part.type === 'file') appendFileBlock(part, blocks);
  }
  return blocks;
}

function appendTextBlock(part, blocks) {
  if (part.text) blocks.push({ type: 'text', text: String(part.text) });
}

function appendImageUrlBlock(part, blocks) {
  const url = String(part.image_url?.url || '').trim();
  const decoded = decodeDataUrl(url);
  if (!decoded) return;
  blocks.push({
    type: 'image',
    source: { type: 'base64', media_type: decoded.mimeType, data: decoded.data },
  });
}

function appendFileBlock(part, blocks) {
  const fileData = String(part.file?.file_data || '').trim();
  const decoded = decodeDataUrl(fileData);
  if (!decoded) return;
  blocks.push({
    type: 'document',
    source: { type: 'base64', media_type: decoded.mimeType, data: decoded.data },
  });
}

function buildAnthropicTools(tools = [], normalize = normalizeToolParameters) {
  const result = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (tool?.type !== 'function') continue;
    const name = getFunctionName(tool);
    if (!name) continue;
    const fn = tool.function || {};
    result.push({
      name,
      description: String(fn.description || ''),
      input_schema: normalize(fn.parameters),
    });
  }
  return result.length ? result : undefined;
}

function hasAssistantToolCalls(role, message) {
  return role === 'assistant' && Array.isArray(message?.tool_calls) && message.tool_calls.length;
}

function appendAssistantToolUseBlocks(message, blocks) {
  for (const call of message.tool_calls) {
    const fn = call?.function || {};
    const name = String(fn.name || '').trim();
    if (!name) continue;
    const input = parseFnArguments(fn.arguments);
    blocks.push({
      type: 'tool_use',
      id: String(call?.id || randomUUID()),
      name,
      input,
    });
  }
}

function buildAssistantToolUseMessage(message) {
  const blocks = contentToAnthropicBlocks(message.content);
  appendAssistantToolUseBlocks(message, blocks);
  if (!blocks.length) return null;
  return { role: 'assistant', content: blocks };
}

function buildToolResultMessage(message) {
  const outputText = contentToText(message.content);
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: String(message?.tool_call_id || ''),
        content: outputText,
        is_error: Boolean(message?.error),
      },
    ],
  };
}

function buildUserOrAssistantMessage(message, role) {
  const blocks = contentToAnthropicBlocks(message.content);
  if (!blocks.length) {
    const text = contentToText(message.content);
    if (text) blocks.push({ type: 'text', text });
  }
  if (!blocks.length) return null;
  return { role, content: blocks };
}

function buildFallbackTextMessage(message) {
  const text = contentToText(message.content);
  if (!text) return null;
  return { role: 'user', content: [{ type: 'text', text }] };
}

function handleAssistantWithTools(message, ctx) {
  const entry = buildAssistantToolUseMessage(message);
  if (entry) ctx.messages.push(entry);
}

function handleUserOrAssistant(message, ctx) {
  const entry = buildUserOrAssistantMessage(message, ctx.role);
  if (entry) ctx.messages.push(entry);
}

function handleTool(message, ctx) {
  ctx.messages.push(buildToolResultMessage(message));
}

function handleFallbackText(message, ctx) {
  const entry = buildFallbackTextMessage(message);
  if (entry) ctx.messages.push(entry);
}

function handleSystemMessage(message, ctx) {
  addSystemContent(message, ctx.systemTexts);
}

function processMessages(messages) {
  const result = { messages: [], systemTexts: [] };
  const ctx = { ...result };
  for (const message of messages || []) {
    const role = normalizeMessageRole(message);
    if (role === 'system') handleSystemMessage(message, ctx);
    else if (hasAssistantToolCalls(role, message)) handleAssistantWithTools(message, ctx);
    else if (role === 'tool') handleTool(message, ctx);
    else if (role === 'user' || role === 'assistant') {
      ctx.role = role;
      handleUserOrAssistant(message, ctx);
    } else handleFallbackText(message, ctx);
  }
  return result;
}

function appendSystemToPayload(payload, systemTexts) {
  if (systemTexts.length) payload.system = systemTexts.join('\n\n');
}

function appendToolsToPayload(payload, normalizedToolChoice, tools, normalize) {
  if (normalizedToolChoice?.type === 'none') return;
  const anthropicTools = buildAnthropicTools(tools, normalize);
  if (anthropicTools) payload.tools = anthropicTools;
}

function appendToolChoiceToPayload(payload, normalizedToolChoice) {
  if (normalizedToolChoice?.type === 'none') return;
  const config = resolveToolChoiceConfig(normalizedToolChoice, {
    auto: () => ({ type: 'auto' }),
    required: () => ({ type: 'any' }),
    tool: (choice) => ({ type: 'tool', name: choice.toolName }),
  });
  if (config) payload.tool_choice = config;
}

export function buildAnthropicPayload(messages, options = {}) {
  const normalize = options.normalizeToolParameters || normalizeToolParameters;
  const payload = {
    model: options.model,
    max_tokens: options.maxTokens || 4096,
  };
  const { messages: payloadMessages, systemTexts } = processMessages(messages);
  payload.messages = payloadMessages;
  appendSystemToPayload(payload, systemTexts);
  const normalizedToolChoice = normalizeToolChoice(options.toolChoice);
  appendToolsToPayload(payload, normalizedToolChoice, options.tools, normalize);
  appendToolChoiceToPayload(payload, normalizedToolChoice);
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
