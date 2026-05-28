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

export function decodeHtmlEntities(content) {
  if (typeof document === 'undefined') return String(content ?? '');
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(content ?? '');
  return textarea.value;
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

export function convertDisplayMathBlocks(content) {
  const lines = String(content ?? '').split('\n');
  const out = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (!inFence) {
      const delimiter = matchDisplayMathDelimiter(trimmed);
      if (delimiter) {
        if (trimmed === delimiter.open) {
          const body = [];
          let j = i + 1;
          while (j < lines.length && lines[j].trim() !== delimiter.close) {
            body.push(lines[j]);
            j += 1;
          }
          if (j < lines.length) {
            out.push('```katex');
            out.push(...body);
            out.push('```');
            i = j;
            continue;
          }
        } else {
          out.push('```katex');
          out.push(trimmed.slice(delimiter.open.length, -delimiter.close.length).trim());
          out.push('```');
          continue;
        }
      }
    }
    out.push(line);
  }
  return out.join('\n');
}
