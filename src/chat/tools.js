export function applyToolCallDelta(target, deltas) {
  if (!Array.isArray(deltas)) return;
  deltas.forEach((delta) => {
    if (!delta) return;
    const index = Number.isFinite(delta.index) ? delta.index : 0;
    if (!target[index]) {
      target[index] = { id: null, name: '', arguments: '' };
    }
    if (delta.id) target[index].id = delta.id;
    if (delta.function?.name) target[index].name += delta.function.name;
    if (delta.function?.arguments) target[index].arguments += delta.function.arguments;
    if (delta.providerMetadata) {
      target[index].providerMetadata = {
        ...(target[index].providerMetadata || {}),
        ...delta.providerMetadata,
        google: {
          ...(target[index].providerMetadata?.google || {}),
          ...(delta.providerMetadata.google || {}),
        },
        vertex: {
          ...(target[index].providerMetadata?.vertex || {}),
          ...(delta.providerMetadata.vertex || {}),
        },
      };
    }
  });
}

export function normalizeToolCalls(stepToolCalls, toolMap) {
  const validCalls = [];
  const unknownCalls = [];
  (Array.isArray(stepToolCalls) ? stepToolCalls : [])
    .filter((call) => call && call.name)
    .forEach((call) => {
      const toolCallId = call.id || crypto.randomUUID();
      const name = String(call.name || '').trim();
      const args = call.arguments || '';
      const mapping = toolMap.get(name);
      if (!mapping) {
        unknownCalls.push({ toolCallId, name, arguments: args });
        return;
      }
      validCalls.push({
        toolCallId,
        modelToolName: name,
        serverId: mapping.serverId,
        toolName: mapping.toolName,
        displayName: mapping.displayName || mapping.toolName,
        arguments: args,
        providerMetadata: call.providerMetadata || null,
      });
    });
  return { validCalls, unknownCalls };
}

export function buildUnknownToolPrompt(unknownCalls, toolMap) {
  const names = unknownCalls.map((call) => call.name).filter(Boolean);
  const known = Array.from(toolMap.keys());
  const preview = known.slice(0, 30);
  const suffix =
    known.length > preview.length ? ` (and ${known.length - preview.length} more)` : '';
  return [
    `The model requested unknown tool name(s): ${names.join(', ') || 'unknown'}.`,
    `Use only these tool names: ${preview.join(', ')}${suffix}.`,
    'If no tool is required, respond directly without tool calls.',
  ].join(' ');
}
