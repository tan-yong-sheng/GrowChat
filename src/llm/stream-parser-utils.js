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

function clearEscape(state) {
  state.escaped = false;
}

function tryBackslash(state, char) {
  if (char !== '\\') return false;
  state.escaped = state.inString;
  return true;
}

function tryQuote(state, char) {
  if (char !== '"') return false;
  state.inString = !state.inString;
  return true;
}

function updateBracketDepth(state, char) {
  if (state.inString) return;
  if (char === '{' || char === '[') state.depth += 1;
  if (char === '}' || char === ']') state.depth -= 1;
}

function updateJsonParseState(state, char) {
  if (state.escaped) {
    clearEscape(state);
    return;
  }
  if (tryBackslash(state, char)) return;
  if (tryQuote(state, char)) return;
  updateBracketDepth(state, char);
}

export function looksLikeIncompleteJson(text) {
  const raw = String(text || '');
  const state = { depth: 0, inString: false, escaped: false };
  for (const char of raw) {
    updateJsonParseState(state, char);
  }
  return state.inString || state.depth > 0;
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
