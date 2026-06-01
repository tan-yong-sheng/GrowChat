export const DEFAULT_REASONING_TAGS = [
  'think',
  'thinking',
  'thought',
  'thoughts',
  'reason',
  'reasoning',
];

export function getPotentialStartIndex(text, searchedText) {
  if (!searchedText.length) return null;
  const directIndex = text.indexOf(searchedText);
  if (directIndex !== -1) return directIndex;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    const suffix = text.substring(i);
    if (searchedText.startsWith(suffix)) return i;
  }
  return null;
}

export function looksLikeIncompleteJson(text) {
  const raw = String(text || '');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const char of raw) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{' || char === '[') depth += 1;
    if (char === '}' || char === ']') depth -= 1;
  }
  return inString || depth > 0;
}

export function extractTextFromGoogle(parsed) {
  const candidate = parsed?.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => {
      if (!part) return '';
      if (typeof part.text === 'string') return part.text;
      return '';
    })
    .join('');
}

export function extractTextFromAnthropic(parsed) {
  if (parsed?.type === 'content_block_delta') {
    return String(parsed?.delta?.text || '');
  }
  if (parsed?.type === 'message_start') {
    return '';
  }
  if (parsed?.type === 'message_delta') {
    return '';
  }
  if (parsed?.type === 'message_stop') {
    return '';
  }
  return '';
}
