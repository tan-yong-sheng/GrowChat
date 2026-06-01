export function decodeDataUrl(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^data:([^;,]+);base64,(.*)$/i);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export function normalizeToolParameters(input) {
  return convertJsonSchemaToOpenApiSchema(input);
}

export function convertJsonSchemaToOpenApiSchema(jsonSchema, isRoot = true) {
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
        result.anyOf = nonNullSchemas.map((item) => convertJsonSchemaToOpenApiSchema(item, false));
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
