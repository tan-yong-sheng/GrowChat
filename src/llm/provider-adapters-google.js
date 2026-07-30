// share the same message-iteration pattern but produce different payload shapes.
// The content-to-parts conversion (GoogleParts vs AnthropicBlocks) and tool-call
// assembly are structurally distinct per provider and cannot be safely shared.

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

function contentToGoogleParts(content) {
  if (typeof content === 'string') return convertStringContentToGoogle(content);
  return convertArrayContentToGoogleParts(content);
}

function convertStringContentToGoogle(content) {
  return content ? [{ text: content }] : [];
}

function convertArrayContentToGoogleParts(content) {
  const parts = [];
  for (const part of Array.isArray(content) ? content : []) {
    if (!part) continue;
    if (part.type === 'text') appendTextPart(part, parts);
    else if (part.type === 'image_url') appendImageUrlPart(part, parts);
    else if (part.type === 'file') appendFilePart(part, parts);
  }
  return parts;
}

function appendTextPart(part, parts) {
  if (part.text) parts.push({ text: String(part.text) });
}

function appendImageUrlPart(part, parts) {
  const url = String(part.image_url?.url || '').trim();
  const dataUrl = decodeDataUrl(url);
  if (dataUrl) {
    parts.push({ inlineData: { mimeType: dataUrl.mimeType, data: dataUrl.data } });
    return;
  }
  if (url) parts.push({ fileData: { fileUri: url, mimeType: 'image/*' } });
}

function appendFilePart(part, parts) {
  const fileData = String(part.file?.file_data || '').trim();
  const decoded = decodeDataUrl(fileData);
  if (decoded) {
    parts.push({ inlineData: { mimeType: decoded.mimeType, data: decoded.data } });
  }
}

function buildGoogleTools(tools = [], normalize = normalizeToolParameters) {
  const functionDeclarations = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (tool?.type !== 'function') continue;
    const name = getFunctionName(tool);
    if (!name) continue;
    const fn = tool.function || {};
    functionDeclarations.push({
      name,
      description: String(fn.description || ''),
      parameters: normalize(fn.parameters),
    });
  }
  return functionDeclarations.length ? [{ functionDeclarations }] : undefined;
}

function getThoughtSignature(call) {
  const signature =
    call?.providerMetadata?.google?.thoughtSignature ??
    call?.providerMetadata?.vertex?.thoughtSignature ??
    call?.providerOptions?.google?.thoughtSignature ??
    call?.providerOptions?.vertex?.thoughtSignature;
  return signature != null ? String(signature) : undefined;
}

function appendAssistantToolCallParts(message, parts) {
  for (const call of message.tool_calls) {
    const fn = call?.function || {};
    const name = String(fn.name || '').trim();
    if (!name) continue;
    const args = parseFnArguments(fn.arguments);
    const thoughtSignature = getThoughtSignature(call);
    parts.push({
      functionCall: { name, args },
      ...(thoughtSignature ? { thoughtSignature } : {}),
    });
  }
}

function hasAssistantToolCalls(role, message) {
  return role === 'assistant' && Array.isArray(message?.tool_calls) && message.tool_calls.length;
}

function buildToolResponseContent(message, toolCallNameMap) {
  const toolName = String(
    message?.name || toolCallNameMap.get(String(message?.tool_call_id || '')) || 'tool'
  ).trim();
  const outputText = contentToText(message.content);
  return {
    role: 'user',
    parts: [
      {
        functionResponse: {
          name: toolName,
          response: { name: toolName, content: outputText },
        },
      },
    ],
  };
}

function buildContentPartsWithFallback(message) {
  const parts = contentToGoogleParts(message.content);
  if (parts.length) return parts;
  const text = contentToText(message.content);
  if (text) parts.push({ text });
  return parts;
}

function buildUserOrAssistantContent(message, role) {
  const parts = buildContentPartsWithFallback(message);
  if (!parts.length) return null;
  return { role: role === 'assistant' ? 'model' : 'user', parts };
}

function buildFallbackTextContent(message) {
  const text = contentToText(message.content);
  if (!text) return null;
  return { role: 'user', parts: [{ text }] };
}

function handleAssistantWithTools(message, ctx) {
  const parts = contentToGoogleParts(message.content);
  appendAssistantToolCallParts(message, parts);
  if (parts.length) ctx.contents.push({ role: 'model', parts });
}

function handleUserOrAssistant(message, ctx) {
  const entry = buildUserOrAssistantContent(message, ctx.role);
  if (entry) ctx.contents.push(entry);
}

function handleTool(message, ctx) {
  ctx.contents.push(buildToolResponseContent(message, ctx.toolCallNameMap));
}

function handleFallbackText(message, ctx) {
  const entry = buildFallbackTextContent(message);
  if (entry) ctx.contents.push(entry);
}

function handleSystemMessage(message, ctx) {
  addSystemContent(message, ctx.systemTexts);
}

function processMessages(messages, toolCallNameMap) {
  const contents = [];
  const systemTexts = [];
  const ctx = { contents, systemTexts, toolCallNameMap };
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
  return { contents, systemTexts };
}

function appendSystemInstruction(payload, systemText) {
  if (systemText) {
    payload.systemInstruction = { parts: [{ text: systemText }] };
  }
}

function appendToolsToPayload(payload, options, normalize) {
  if (normalizeToolChoice(options.toolChoice)?.type === 'none') return;
  const googleTools = buildGoogleTools(options.tools, normalize);
  if (googleTools) payload.tools = googleTools;
}

function appendToolConfigToPayload(payload, options) {
  const config = resolveToolChoiceConfig(options.toolChoice, {
    auto: () => ({ functionCallingConfig: { mode: 'AUTO' } }),
    none: () => ({ functionCallingConfig: { mode: 'NONE' } }),
    required: () => ({ functionCallingConfig: { mode: 'ANY' } }),
    tool: (choice) => ({
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [choice.toolName],
      },
    }),
  });
  if (config) payload.toolConfig = config;
}

function appendGenerationConfig(payload, options) {
  if (options.stream !== false) payload.generationConfig = {};
}

export function buildGooglePayload(messages, options = {}) {
  const { contents, systemTexts } = processMessages(messages, buildToolCallNameMap(messages));
  const payload = { contents };
  appendSystemInstruction(payload, systemTexts.join('\n\n').trim());
  appendToolsToPayload(
    payload,
    options,
    options.normalizeToolParameters || normalizeToolParameters
  );
  appendToolConfigToPayload(payload, options);
  appendGenerationConfig(payload, options);
  return payload;
}
