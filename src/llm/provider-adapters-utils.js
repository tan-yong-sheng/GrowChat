export function decodeDataUrl(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^data:([^;,]+);base64,(.*)$/i);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export function normalizeToolParameters(input) {
  return convertJsonSchemaToOpenApiSchema(input);
}

export function isEmptyObjectSchema(jsonSchema) {
  return (
    jsonSchema != null &&
    typeof jsonSchema === 'object' &&
    jsonSchema.type === 'object' &&
    (jsonSchema.properties == null || Object.keys(jsonSchema.properties).length === 0) &&
    !jsonSchema.additionalProperties
  );
}

export function normalizeToolChoice(toolChoice) {
  if (!toolChoice) return undefined;
  if (typeof toolChoice === 'string') return normalizeStringToolType(toolChoice);
  return normalizeObjectToolChoice(toolChoice);
}

function normalizeStringToolType(type) {
  const normalized = type.toLowerCase();
  if (['auto', 'none', 'required'].includes(normalized)) return { type: normalized };
  return undefined;
}

function hasToolName(toolChoice) {
  return Boolean(
    toolChoice.toolName || toolChoice.name || (toolChoice.function && toolChoice.function.name)
  );
}

function hasFunctionName(toolChoice) {
  return Boolean((toolChoice.function && toolChoice.function.name) || toolChoice.name);
}

function normalizeObjectToolChoice(toolChoice) {
  const type = String(toolChoice.type || '').toLowerCase();
  if (!type) return undefined;
  if (['auto', 'none', 'required'].includes(type)) return { type };
  if (type === 'tool' && hasToolName(toolChoice)) {
    return { type: 'tool', toolName: resolveToolName(toolChoice) };
  }
  if (type === 'function' && hasFunctionName(toolChoice)) {
    return { type: 'tool', toolName: resolveFunctionName(toolChoice) };
  }
  return undefined;
}

function resolveToolName(toolChoice) {
  return String(toolChoice.toolName || toolChoice.name || toolChoice.function?.name);
}

function resolveFunctionName(toolChoice) {
  return String(toolChoice.function?.name || toolChoice.name);
}

export function convertJsonSchemaToOpenApiSchema(jsonSchema, isRoot = true) {
  if (jsonSchema == null) return undefined;
  if (typeof jsonSchema === 'boolean') return { type: 'boolean', properties: {} };
  if (Array.isArray(jsonSchema) || typeof jsonSchema !== 'object') return jsonSchema;
  if (isEmptyObjectSchema(jsonSchema)) {
    return isRoot ? undefined : convertEmptySchema(jsonSchema);
  }
  return convertSchemaObject(jsonSchema);
}

function convertEmptySchema(jsonSchema) {
  if (typeof jsonSchema === 'object' && jsonSchema.description) {
    return { type: 'object', description: jsonSchema.description };
  }
  return { type: 'object' };
}

const SIMPLE_SCHEMA_FIELDS = ['description', 'required', 'format'];

function applySimpleSchemaField(result, jsonSchema, key) {
  const value = jsonSchema[key];
  if (value !== undefined) result[key] = value;
}

function applyConstSchemaField(result, constValue) {
  if (constValue !== undefined) result.enum = [constValue];
}

function applyTypeSchemaField(result, type) {
  if (!type) return;
  if (Array.isArray(type)) handleTypeArray(type, result);
  else result.type = type;
}

function applyEnumSchemaField(result, enumValues) {
  if (enumValues !== undefined) result.enum = enumValues;
}

function applyPropertiesSchemaField(result, properties) {
  if (properties) handleProperties(properties, result);
}

function applyItemsSchemaField(result, items) {
  if (items) handleItems(items, result);
}

function applyAllOfSchemaField(result, allOf) {
  if (allOf) handleAllOf(allOf, result);
}

function applyAnyOfSchemaField(result, anyOf) {
  if (anyOf) handleAnyOfSchemas(anyOf, result);
}

function applyOneOfSchemaField(result, oneOf) {
  if (oneOf) handleOneOf(oneOf, result);
}

function applyMinLengthSchemaField(result, minLength) {
  if (minLength !== undefined) result.minLength = minLength;
}

function convertSchemaObject(jsonSchema) {
  const result = {};
  for (const key of SIMPLE_SCHEMA_FIELDS) {
    applySimpleSchemaField(result, jsonSchema, key);
  }
  applyConstSchemaField(result, jsonSchema.const);
  applyTypeSchemaField(result, jsonSchema.type);
  applyEnumSchemaField(result, jsonSchema.enum);
  applyPropertiesSchemaField(result, jsonSchema.properties);
  applyItemsSchemaField(result, jsonSchema.items);
  applyAllOfSchemaField(result, jsonSchema.allOf);
  applyAnyOfSchemaField(result, jsonSchema.anyOf);
  applyOneOfSchemaField(result, jsonSchema.oneOf);
  applyMinLengthSchemaField(result, jsonSchema.minLength);
  return result;
}

function handleTypeArray(typeArray, result) {
  const hasNull = typeArray.includes('null');
  const nonNullTypes = typeArray.filter((t) => t !== 'null');
  if (nonNullTypes.length === 0) {
    result.type = 'null';
    if (hasNull) result.nullable = true;
  } else {
    result.anyOf = nonNullTypes.map((t) => ({ type: t }));
    if (hasNull) result.nullable = true;
  }
}

function handleAnyOfSchemas(anyOf, result) {
  const hasNullType = anyOf.some((s) => typeof s === 'object' && s?.type === 'null');
  if (hasNullType) {
    const nonNull = anyOf.filter((s) => !(typeof s === 'object' && s?.type === 'null'));
    if (nonNull.length === 1) {
      const converted = convertJsonSchemaToOpenApiSchema(nonNull[0], false);
      if (typeof converted === 'object' && converted) {
        result.nullable = true;
        Object.assign(result, converted);
      }
    } else {
      result.anyOf = nonNull.map((item) => convertJsonSchemaToOpenApiSchema(item, false));
      result.nullable = true;
    }
  } else {
    result.anyOf = anyOf.map((item) => convertJsonSchemaToOpenApiSchema(item, false));
  }
}

function handleEnumValues(enumValues, result) {
  result.enum = enumValues;
}

function handleProperties(properties, result) {
  result.properties = Object.entries(properties).reduce(
    (acc, [key, value]) => ((acc[key] = convertJsonSchemaToOpenApiSchema(value, false)), acc),
    {}
  );
}

function handleItems(items, result) {
  result.items = Array.isArray(items)
    ? items.map((item) => convertJsonSchemaToOpenApiSchema(item, false))
    : convertJsonSchemaToOpenApiSchema(items, false);
}

function handleAllOf(allOf, result) {
  result.allOf = allOf.map((item) => convertJsonSchemaToOpenApiSchema(item, false));
}

function handleOneOf(oneOf, result) {
  result.oneOf = oneOf.map((item) => convertJsonSchemaToOpenApiSchema(item, false));
}

function handleMinLength(minLength, result) {
  if (minLength !== undefined) result.minLength = minLength;
}

export function buildToolCallNameMap(messages = []) {
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

export function contentToText(value) {
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
