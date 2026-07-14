/**
 * Shared markdown utility functions.
 * Extracted to break circular dependencies between markdown sub-modules.
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const HTML_ENTITY_RE = /&(?:#(x[0-9a-fA-F]+|\d+)|([a-zA-Z]+));/g;

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
  mdash: '\u2014',
  ndash: '\u2013',
  laquo: '\u00AB',
  raquo: '\u00BB',
  hellip: '\u2026',
  bull: '\u2022',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201C',
  rdquo: '\u201D',
  trade: '\u2122',
  copy: '\u00A9',
  reg: '\u00AE',
  euro: '\u20AC',
};

export function decodeHtmlEntities(content) {
  const text = String(content ?? '');
  return text.replace(HTML_ENTITY_RE, (match, numRef, nameRef) => {
    if (nameRef) {
      return NAMED_ENTITIES[nameRef] || match;
    }
    if (numRef) {
      const code = numRef.startsWith('x') ? parseInt(numRef.slice(1), 16) : parseInt(numRef, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

export function normalizeSpecialBlockScope(scope) {
  return String(scope ?? '').trim();
}

export function normalizeSpecialBlockMode(mode) {
  return mode === 'code' ? 'code' : 'preview';
}

const DISPLAY_MATH_DELIMITERS = [
  { open: '$$', close: '$$', kind: 'katex' },
  { open: '\\[', close: '\\]', kind: 'katex' },
  { open: '\\begin{equation}', close: '\\end{equation}', kind: 'katex' },
];

const FULL_LATEX_DOCUMENT_PATTERNS = [
  /\\documentclass\b/i,
  /\\begin\{document\}/i,
  /\\end\{document\}/i,
];

export function isFullLatexDocument(content) {
  const text = String(content ?? '');
  return FULL_LATEX_DOCUMENT_PATTERNS.some((pattern) => pattern.test(text));
}

function matchDisplayMathDelimiter(trimmedLine) {
  return (
    DISPLAY_MATH_DELIMITERS.find(
      (delimiter) =>
        trimmedLine === delimiter.open ||
        (trimmedLine.startsWith(delimiter.open) &&
          trimmedLine.endsWith(delimiter.close) &&
          trimmedLine.length > delimiter.open.length + delimiter.close.length)
    ) || null
  );
}

function isFenceToggle(trimmed) {
  return trimmed.startsWith('```');
}

function applyInlineDisplayMath(out, trimmed, delimiter) {
  out.push('```katex');
  out.push(trimmed.slice(delimiter.open.length, -delimiter.close.length).trim());
  out.push('```');
}

function collectDisplayMathBody(lines, startIdx, delimiter) {
  const body = [];
  let j = startIdx + 1;
  while (j < lines.length && lines[j].trim() !== delimiter.close) {
    body.push(lines[j]);
    j += 1;
  }
  return { body, endIdx: j };
}

function applyBlockDisplayMath(out, body) {
  out.push('```katex');
  out.push(...body);
  out.push('```');
}

function handleMathLine(lines, i, trimmed) {
  const delimiter = matchDisplayMathDelimiter(trimmed);
  if (!delimiter) return null;
  if (trimmed === delimiter.open) {
    const { body, endIdx } = collectDisplayMathBody(lines, i, delimiter);
    if (endIdx < lines.length) {
      const outputs = [];
      applyBlockDisplayMath(outputs, body);
      return { nextIndex: endIdx + 1, outputs };
    }
    return null;
  }
  const outputs = [];
  applyInlineDisplayMath(outputs, trimmed, delimiter);
  return { nextIndex: i + 1, outputs };
}

function processDisplayMathLine(lines, i, inFence) {
  const line = lines[i];
  const trimmed = line.trim();
  if (isFenceToggle(trimmed)) {
    return { nextIndex: i + 1, outputs: [line], inFence: !inFence };
  }
  if (inFence) {
    return { nextIndex: i + 1, outputs: [line], inFence };
  }
  const mathResult = handleMathLine(lines, i, trimmed);
  if (mathResult) {
    return { ...mathResult, inFence };
  }
  return { nextIndex: i + 1, outputs: [line], inFence };
}

export function convertDisplayMathBlocks(content) {
  const lines = String(content ?? '').split('\n');
  const out = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const result = processDisplayMathLine(lines, i, inFence);
    inFence = result.inFence;
    out.push(...result.outputs);
    i = result.nextIndex - 1;
  }
  return out.join('\n');
}

// Special block session state (shared mutable state)
let specialBlockScopeKey = '';
let specialBlockMode = 'preview';

export function resolveSpecialBlockSession(scope) {
  const nextScope = String(scope ?? '').trim();
  if (!nextScope) {
    return { scope: '', mode: 'preview' };
  }
  if (specialBlockScopeKey !== nextScope) {
    specialBlockScopeKey = nextScope;
    specialBlockMode = 'preview';
  }
  return { scope: specialBlockScopeKey, mode: specialBlockMode };
}

export function resetSpecialBlockState() {
  specialBlockScopeKey = '';
  specialBlockMode = 'preview';
}
