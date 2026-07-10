import {
  decodeDataUrl,
  normalizeToolParameters,
  normalizeToolChoice,
  buildToolCallNameMap,
  contentToText,
} from './provider-adapters-utils.js';
import {
  parseFnArguments,
  resolveToolChoiceConfig,
  addSystemContent,
  normalizeMessageRole,
} from './provider-adapters-shared.js';

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
          inlineData: { mimeType: dataUrl.mimeType, data: dataUrl.data },
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
          inlineData: { mimeType: decoded.mimeType, data: decoded.data },
        });
      }
    }
  }
  return parts;
}

function buildGoogleTools(tools = [], normalize = normalizeToolParameters) {
  const functionDeclarations = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (tool?.type !== 'function') continue;
    const fn = tool.function || {};
    const name = String(fn.name || '').trim();
    if (!name) continue;
    functionDeclarations.push({
      name,
      description: String(fn.description || ''),
      parameters: normalize(fn.parameters),
    });
  }
  return functionDeclarations.length ? [{ functionDeclarations }] : undefined;
}

export function buildGooglePayload(messages, options = {}) {
  const contents = [];
  const systemTexts = [];
  const toolCallNameMap = buildToolCallNameMap(messages);
  const normalize = options.normalizeToolParameters || normalizeToolParameters;

  const getThoughtSignature = (call) => {
    const signature =
      call?.providerMetadata?.google?.thoughtSignature ??
      call?.providerMetadata?.vertex?.thoughtSignature ??
      call?.providerOptions?.google?.thoughtSignature ??
      call?.providerOptions?.vertex?.thoughtSignature;
    return signature != null ? String(signature) : undefined;
  };

  for (const message of messages || []) {
    const role = normalizeMessageRole(message);
    if (role === 'system') {
      addSystemContent(message, systemTexts);
      continue;
    }
    if (role === 'assistant' && Array.isArray(message?.tool_calls) && message.tool_calls.length) {
      const parts = contentToGoogleParts(message.content);
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
      if (!parts.length) continue;
      contents.push({ role: 'model', parts });
      continue;
    }
    if (role === 'tool') {
      const toolName = String(
        message?.name || toolCallNameMap.get(String(message?.tool_call_id || '')) || 'tool'
      ).trim();
      const outputText = contentToText(message.content);
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: { name: toolName, content: outputText },
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
      contents.push({ role: role === 'assistant' ? 'model' : 'user', parts });
      continue;
    }
    const text = contentToText(message.content);
    if (text) {
      contents.push({ role: 'user', parts: [{ text }] });
    }
  }

  const systemText = systemTexts.join('\n\n').trim();
  const payload = { contents };
  if (systemText) {
    payload.systemInstruction = { parts: [{ text: systemText }] };
  }
  const googleTools = buildGoogleTools(options.tools, normalize);
  if (googleTools) {
    payload.tools = googleTools;
  }
  const googleToolConfig = resolveToolChoiceConfig(options.toolChoice, {
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
  if (googleToolConfig) {
    payload.toolConfig = googleToolConfig;
  }
  if (options.stream !== false) {
    payload.generationConfig = {};
  }
  return payload;
}
