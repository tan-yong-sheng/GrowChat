/**
 * Markdown token-to-HTML rendering functions.
 * Converts marked lexer tokens into sanitized HTML strings.
 */

import {
  escapeHtml,
  decodeHtmlEntities,
  isFullLatexDocument,
  resolveSpecialBlockSession,
} from './markdown-shared.js';

import {
  getSpecialBlockKind,
  getSpecialBlockLabel,
  getSpecialCodeLanguage,
  getSpecialPreviewPlaceholder,
  renderPlainCodeBlock,
} from './markdown-special-block-ui.js';

export function renderInlineTokens(tokens = []) {
  return (Array.isArray(tokens) ? tokens : []).map((token) => renderInlineToken(token)).join('');
}

function _renderInlineTextOrEscape(token) {
  return escapeHtml(decodeHtmlEntities(token.text ?? token.raw ?? '')).replace(/\n/g, ' ');
}

function _renderInlineStrong(token) {
  return `<strong>${renderInlineTokens(token.tokens)}</strong>`;
}

function _renderInlineEm(token) {
  return `<em>${renderInlineTokens(token.tokens)}</em>`;
}

function _renderInlineDel(token) {
  return `<del>${renderInlineTokens(token.tokens)}</del>`;
}

function _renderInlineCodespan(token) {
  return `<code class="gc-inline-code" data-markdown-inline-code>${escapeHtml(token.text ?? '')}</code>`;
}

function _renderInlineLink(token) {
  const href = escapeHtml(token.href ?? '');
  const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
  const inner = renderInlineTokens(token.tokens || []) || escapeHtml(token.text ?? '');
  return `<a href="${href}" target="_blank" rel="noopener noreferrer"${title}>${inner}</a>`;
}

function _renderInlineImage(token) {
  return `<img src="${escapeHtml(token.href ?? '')}" alt="${escapeHtml(token.text ?? '')}" loading="lazy" />`;
}

function _renderInlineDefault(token) {
  if (Array.isArray(token.tokens)) {
    return renderInlineTokens(token.tokens);
  }
  return escapeHtml(token.text ?? token.raw ?? '');
}

const INLINE_TOKEN_HANDLERS = {
  escape: _renderInlineTextOrEscape,
  text: _renderInlineTextOrEscape,
  strong: _renderInlineStrong,
  em: _renderInlineEm,
  del: _renderInlineDel,
  codespan: _renderInlineCodespan,
  br: () => '<br />',
  link: _renderInlineLink,
  image: _renderInlineImage,
  html: (token) => token.raw ?? token.text ?? '',
  __default: _renderInlineDefault,
};

export function renderInlineToken(token) {
  if (!token) return '';
  const type = String(token.type || '');
  const handler = INLINE_TOKEN_HANDLERS[type] || INLINE_TOKEN_HANDLERS.__default;
  return handler(token);
}

function _renderSpecialBlockLatex(token, { interactive, streaming, langLabel, sourceLanguage }) {
  return renderPlainCodeBlock(token, {
    interactive,
    streaming,
    langLabel,
    sourceLanguage,
  });
}

function _renderSpecialBlockNonInteractive({ kind, scopeAttr, isStreaming }) {
  return `<div class="gc-markdown-special-shell gc-markdown-special-static" data-markdown-special-block${scopeAttr} data-markdown-special-kind="${escapeHtml(kind)}" data-markdown-special-mode="preview" data-markdown-special-streaming="${isStreaming ? '1' : '0'}"><div class="gc-markdown-special-preview" data-markdown-special-preview><div class="gc-markdown-special-placeholder">${escapeHtml(getSpecialPreviewPlaceholder(kind))}</div></div></div>`;
}

function _renderSpecialBlockToolbar({ langLabel, specialMode, isStreaming }) {
  return `<div class="gc-markdown-special-toolbar">
        <div class="gc-markdown-special-title">${escapeHtml(langLabel)}</div>
        <div class="gc-markdown-special-toolbar-actions">
          <div class="gc-markdown-special-tabs" role="tablist" aria-label="${escapeHtml(langLabel)} view mode">
            <button type="button" class="gc-markdown-special-tab" data-markdown-special-mode-btn="preview" aria-pressed="${specialMode === 'preview' ? 'true' : 'false'}" ${isStreaming ? 'disabled aria-disabled="true"' : ''}>Preview</button>
            <button type="button" class="gc-markdown-special-tab" data-markdown-special-mode-btn="code" aria-pressed="${specialMode === 'code' ? 'true' : 'false'}">Code</button>
          </div>
          <div class="gc-markdown-code-actions">
            <button type="button" class="gc-markdown-code-action" data-markdown-special-copy title="Copy code" aria-label="Copy code">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
              </svg>
              <span>Copy</span>
            </button>
            <button type="button" class="gc-markdown-code-action" data-markdown-special-collapse title="Collapse code" aria-label="Collapse code" aria-expanded="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" class="size-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="m6 15 6-6 6 6"></path>
              </svg>
              <span data-markdown-special-collapse-label>Collapse</span>
            </button>
          </div>
        </div>
      </div>`;
}

function _renderSpecialBlockCodeHtml({ code, languageClass, specialMode }) {
  return `<div class="gc-markdown-special-code-shell ${specialMode === 'code' ? '' : 'hidden'}" data-markdown-special-code-shell>
    <pre class="gc-markdown-code-block" data-markdown-special-code><code class="${languageClass}">${code}</code></pre>
  </div>`;
}

function _renderSpecialBlockPreview({ kind, specialMode }) {
  return `<div class="gc-markdown-special-preview ${specialMode === 'code' ? 'hidden' : ''}" data-markdown-special-preview>
    <div class="gc-markdown-special-placeholder">${escapeHtml(getSpecialPreviewPlaceholder(kind))}</div>
  </div>`;
}

function _getSpecialBlockTokenMetadata(token) {
  const lang = String(token?.lang || '').trim();
  const kind = getSpecialBlockKind(lang);
  const langLabel = kind ? getSpecialBlockLabel(kind) : lang || 'text';
  const sourceText = String(token?.text ?? '');
  return { lang, kind, langLabel, sourceText };
}

function _getSpecialBlockCodeAttributes(kind, sourceText, specialSession) {
  const code = escapeHtml(sourceText);
  const sourceLanguage = getSpecialCodeLanguage(kind);
  const languageClass = sourceLanguage ? `language-${escapeHtml(sourceLanguage)}` : '';
  const scopeAttr = specialSession.scope
    ? ` data-markdown-special-scope="${escapeHtml(specialSession.scope)}"`
    : '';
  return { code, languageClass, scopeAttr };
}

export function renderCodeBlock(
  token,
  { interactive = true, streaming = false, specialBlockScope = '' } = {}
) {
  const isStreaming = Boolean(streaming);
  const { lang, kind, langLabel, sourceText } = _getSpecialBlockTokenMetadata(token);
  const specialSession = resolveSpecialBlockSession(specialBlockScope);
  const specialMode = isStreaming ? 'code' : specialSession.mode;
  if (kind && isFullLatexDocument(sourceText)) {
    return _renderSpecialBlockLatex(token, {
      interactive,
      streaming,
      langLabel,
      sourceLanguage: lang || 'text',
    });
  }
  if (kind) {
    const { code, languageClass, scopeAttr } = _getSpecialBlockCodeAttributes(
      kind,
      sourceText,
      specialSession
    );
    const codeHtml = _renderSpecialBlockCodeHtml({ code, languageClass, specialMode });
    if (!interactive) {
      return _renderSpecialBlockNonInteractive({ kind, scopeAttr, isStreaming });
    }
    return `
    <div class="gc-markdown-special-shell" data-markdown-special-block${scopeAttr} data-markdown-special-kind="${escapeHtml(kind)}" data-markdown-special-mode="${escapeHtml(specialMode)}" data-markdown-special-streaming="${isStreaming ? '1' : '0'}" data-markdown-special-collapsed="0">
      ${_renderSpecialBlockToolbar({ langLabel, specialMode, isStreaming })}
      ${codeHtml}
      ${_renderSpecialBlockPreview({ kind, specialMode })}
    </div>
    `;
  }
  return renderPlainCodeBlock(token, {
    interactive,
    streaming,
    langLabel,
    sourceLanguage: lang || 'text',
  });
}

export function renderTable(token) {
  const header = (token.header || [])
    .map((cell, idx) => {
      const align = token.align?.[idx] ? ` style="text-align:${token.align[idx]}"` : '';
      return `<th${align}>${renderInlineTokens(cell.tokens || [])}</th>`;
    })
    .join('');
  const rows = (token.rows || [])
    .map((row) => {
      const cells = (row || [])
        .map((cell, idx) => {
          const align = token.align?.[idx] ? ` style="text-align:${token.align[idx]}"` : '';
          return `<td${align}>${renderInlineTokens(cell.tokens || [])}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `
  <div class="gc-markdown-table-wrap">
    <table class="gc-markdown-table" dir="auto">
      <thead><tr>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  `;
}

export function renderListItem(item, options = {}) {
  const content = renderMarkdownTokens(item.tokens || [], options);
  const task = item.task
    ? `<input type="checkbox" disabled ${item.checked ? 'checked' : ''} />`
    : '';
  return `<li>${task}${content}</li>`;
}

export function renderBlockquote(token, options = {}) {
  const content = renderMarkdownTokens(token.tokens || [], options);
  return `<blockquote dir="auto">${content}</blockquote>`;
}

function _renderHeadingToken(token) {
  const content = renderInlineTokens(token.tokens || []);
  return `<h${token.depth || 1} dir="auto">${content}</h${token.depth || 1}>`;
}

function _renderParagraphToken(token) {
  return `<p dir="auto">${renderInlineTokens(token.tokens || [])}</p>`;
}

function _renderTextMarkdownToken(token) {
  return token.tokens
    ? renderInlineTokens(token.tokens)
    : `<p dir="auto">${escapeHtml(token.text ?? token.raw ?? '').replace(/\n/g, ' ')}</p>`;
}

function _renderListToken(token, options) {
  const listTag = token.ordered ? 'ol' : 'ul';
  const startAttr = token.ordered && token.start ? ` start="${token.start}"` : '';
  const items = (token.items || []).map((item) => renderListItem(item, options)).join('');
  return `<${listTag}${startAttr} dir="auto">${items}</${listTag}>`;
}

function _renderDefaultMarkdownToken(token) {
  if (Array.isArray(token.tokens)) {
    return renderMarkdownTokens(token.tokens, {});
  }
  return escapeHtml(token.text ?? token.raw ?? '');
}

const MARKDOWN_TOKEN_HANDLERS = {
  space: () => '',
  hr: () => '<hr />',
  heading: (token) => _renderHeadingToken(token),
  paragraph: (token) => _renderParagraphToken(token),
  text: (token) => _renderTextMarkdownToken(token),
  code: (token, options) => renderCodeBlock(token, options),
  blockquote: (token, options) => renderBlockquote(token, options),
  list: (token, options) => _renderListToken(token, options),
  table: (token, options) => renderTable(token, options),
  html: (token) => token.raw ?? token.text ?? '',
  __default: (token) => _renderDefaultMarkdownToken(token),
};

export function renderMarkdownToken(token, options = {}) {
  if (!token) return '';
  const type = String(token.type || '');
  const handler = MARKDOWN_TOKEN_HANDLERS[type] || MARKDOWN_TOKEN_HANDLERS.__default;
  return handler(token, options);
}

export function renderMarkdownTokens(tokens = [], options = {}) {
  return (Array.isArray(tokens) ? tokens : [])
    .map((token) => renderMarkdownToken(token, options))
    .join('');
}
