import { renderSearchBarHtml } from './search-bar.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const PAGE_SIZE_TWENTY = 20;
const PAGE_SIZE_FIFTY = 50;
const PAGE_SIZE_HUNDRED = 100;
const PAGE_SIZE_OPTIONS = Object.freeze([PAGE_SIZE_TWENTY, PAGE_SIZE_FIFTY, PAGE_SIZE_HUNDRED]);

// -- renderModelsHeaderHtml sub-helpers --

const HEADER_DEFAULTS = Object.freeze({
  countTitle: 'Active models',
  countLabel: '',
  countValue: '',
  searchValue: '',
  clearButtonId: '',
  clearHidden: true,
  _providerValue: 'all',
  providerOptionsMarkup: '',
  searchPlaceholder: 'Search models',
});

function renderModelsTitleSection(countLabel, countValue, countTitle) {
  const labelHtml = countLabel
    ? `<div data-models-count-label class="text-label-sm font-semibold uppercase tracking-[0.18em] text-gray-400">${escapeHtml(countLabel)}</div>`
    : '';
  const valueClass = countLabel ? '' : ' ml-0.5';
  return `
    <div class="flex items-center text-xl font-medium px-0.5 gap-2">
      <div class="flex-shrink-0 text-gray-900">Models</div>
      <div class="flex flex-col items-start leading-tight">
        ${labelHtml}
        <div data-models-count-value class="text-gray-500 font-normal${valueClass}" title="${escapeHtml(countTitle)}">${escapeHtml(countValue)}</div>
      </div>
    </div>`;
}

function renderModelsControlsSection(section) {
  return `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:flex-wrap">
      ${renderSearchBarHtml({
        inputId: section.searchId,
        value: section.searchValue,
        placeholder: section.searchPlaceholder,
        clearId: section.clearId,
        clearButtonId: section.clearButtonId,
        clearHidden: section.clearHidden,
      })}
      <select id="${escapeHtml(section.providerId)}" class="w-full sm:w-auto min-w-0 rounded-md border border-gray-100/30 bg-gray-50/50 px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300">
        ${section.providerOptionsMarkup}
      </select>
    </div>`;
}

export function renderModelsHeaderHtml(opts) {
  const o = { ...HEADER_DEFAULTS, ...opts };
  return `
    <div class="pt-0.5 pb-2.5 flex flex-col gap-3 lg:flex-row lg:justify-between lg:items-center bg-white">
      ${renderModelsTitleSection(o.countLabel, o.countValue, o.countTitle)}
      ${renderModelsControlsSection(o)}
    </div>
  `;
}

// -- renderModelsTableShellHtml sub-helpers --

const TABLE_SHELL_DEFAULTS = Object.freeze({
  _usingFilter: false,
  tbodyId: 'models-table-body',
  emptyColSpan: 4,
});

function computeTableBodyContent(loading, rowsHtml, emptyMessage, emptyColSpan) {
  if (loading) return rowsHtml;
  return (
    rowsHtml ||
    `
      <tr>
        <td colspan="${emptyColSpan}" class="py-10 text-center text-sm text-gray-400">
          ${escapeHtml(emptyMessage || 'No models found.')}
        </td>
      </tr>
    `
  );
}

export function renderModelsTableShellHtml(opts) {
  const o = { ...TABLE_SHELL_DEFAULTS, ...opts };
  const body = computeTableBodyContent(o.loading, o.rowsHtml, o.emptyMessage, o.emptyColSpan);

  return `
    <div class="pb-6">
      <div class="relative w-full rounded-lg border border-gray-100 bg-white">
        <div class="max-h-[calc(100dvh-20rem)] overflow-y-scroll overflow-x-auto pb-24 scroll-pb-24" data-models-scroll="1" style="scrollbar-gutter: stable;">
          <table class="w-full text-sm text-left text-gray-500 table-fixed">
            <thead class="text-label-sm text-gray-900 font-bold uppercase bg-white sticky top-0 z-10">
              <tr class="border-b border-gray-100">
                <th scope="col" class="px-4 py-3 w-1/4">Name</th>
                <th scope="col" class="px-4 py-3 w-1/3">Model ID</th>
                <th scope="col" class="px-4 py-3 w-1/4">Access</th>
                <th scope="col" class="px-4 py-3 w-1/6 text-right">Status</th>
              </tr>
            </thead>
            <tbody id="${escapeHtml(o.tbodyId)}" class="divide-y divide-gray-50/50">
              ${body}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// -- renderModelsPaginationHtml sub-helpers --

const PAGINATION_DEFAULTS = Object.freeze({
  pageSizeId: 'page-size-select',
  limit: PAGE_SIZE_TWENTY,
  pageStart: 0,
  pageEnd: 0,
  pageTotal: 0,
  currentPage: 1,
  totalPages: 1,
  loading: false,
  usingFilter: false,
  prevId: 'prev-page',
  nextId: 'next-page',
});

function renderPageSizeOptions(limit) {
  return PAGE_SIZE_OPTIONS.map(
    (size) => `<option value="${size}" ${limit === size ? 'selected' : ''}>${size}</option>`
  ).join('\n    ');
}

function renderPaginationNav(nav) {
  return `
    <div class="flex items-center gap-3">
      <div data-models-page-range>${nav.pageStart}-${nav.pageEnd} of ${nav.pageTotal}</div>
      <div data-models-page-text>Page ${nav.currentPage} / ${nav.totalPages}</div>
      <div class="flex items-center gap-2">
        <button id="${escapeHtml(nav.prevId)}" class="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed" ${nav.loading || nav.usingFilter || nav.pageStart <= 1 ? 'disabled' : ''}>
          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <button id="${escapeHtml(nav.nextId)}" class="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed" ${nav.loading || nav.usingFilter || nav.pageEnd >= nav.pageTotal ? 'disabled' : ''}>
          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>`;
}

export function renderModelsPaginationHtml(opts) {
  const o = { ...PAGINATION_DEFAULTS, ...opts };
  return `
    <div class="shrink-0 border-t border-gray-100 bg-white shadow-[0_-1px_0_rgba(17,24,39,0.04)]" data-models-pagination>
      <div class="flex items-center justify-between gap-4 py-4 px-0.5 text-sm text-gray-500">
        <div class="flex items-center gap-3">
          <span>Show</span>
          <select id="${escapeHtml(o.pageSizeId)}" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300" ${o.loading ? 'disabled' : ''}>
            ${renderPageSizeOptions(o.limit)}
          </select>
        </div>
        ${renderPaginationNav(o)}
      </div>
    </div>
  `;
}

// -- DOM sync helpers --

function setCountElement(container, countValue, countTitle) {
  const countEl = container.querySelector('[data-models-count-value]');
  if (!countEl) return;
  countEl.textContent = String(countValue ?? '');
  countEl.title = countTitle;
}

function setSearchInput(container, searchId, searchValue) {
  const searchInput = searchId ? container.querySelector(`#${escapeHtml(searchId)}`) : null;
  if (!searchInput || document.activeElement === searchInput) return;
  const next = String(searchValue ?? '');
  if (searchInput.value !== next) searchInput.value = next;
}

function setClearWrap(container, clearId, clearHidden) {
  const clearWrap = clearId ? container.querySelector(`#${escapeHtml(clearId)}`) : null;
  if (clearWrap) clearWrap.classList.toggle('hidden', Boolean(clearHidden));
}

function setClearButton(container, clearButtonId) {
  const clearBtn = clearButtonId ? container.querySelector(`#${escapeHtml(clearButtonId)}`) : null;
  if (clearBtn) clearBtn.disabled = false;
}

function setProviderSelect(container, providerId, providerValue, providerOptionsMarkup) {
  const providerSelect = providerId ? container.querySelector(`#${escapeHtml(providerId)}`) : null;
  if (!providerSelect) return;
  const currentValue = String(providerValue ?? 'all');
  if (providerSelect.value !== currentValue) providerSelect.value = currentValue;
  if (!providerOptionsMarkup) return;
  const nextHtml = providerOptionsMarkup.trim();
  if (providerSelect.innerHTML.trim() === nextHtml) return;
  providerSelect.innerHTML = providerOptionsMarkup;
  providerSelect.value = currentValue;
}

const SYNC_HEADER_DEFAULTS = Object.freeze({
  countTitle: 'Active models',
  _countLabel: '',
  countValue: '',
  searchValue: '',
  clearButtonId: '',
  clearHidden: true,
  providerOptionsMarkup: '',
  providerValue: 'all',
});

export function syncModelsHeaderState(container, opts) {
  const o = { ...SYNC_HEADER_DEFAULTS, ...opts };
  if (!container) return;
  setCountElement(container, o.countValue, o.countTitle);
  setSearchInput(container, o.searchId, o.searchValue);
  setClearWrap(container, o.clearId, o.clearHidden);
  setClearButton(container, o.clearButtonId);
  setProviderSelect(container, o.providerId, o.providerValue, o.providerOptionsMarkup);
}

// -- syncModelsTableState helpers --

const SYNC_TABLE_DEFAULTS = Object.freeze({
  _usingFilter: false,
  tbodyId: 'models-table-body',
  emptyColSpan: 4,
});

function computeTableBody(loading, rowsHtml, emptyMessage, emptyColSpan) {
  if (loading) return rowsHtml;
  return (
    rowsHtml ||
    `
      <tr>
        <td colspan="${emptyColSpan}" class="py-10 text-center text-sm text-gray-400">
          ${escapeHtml(emptyMessage || 'No models found.')}
        </td>
      </tr>
    `
  );
}

export function syncModelsTableState(container, opts) {
  const o = { ...SYNC_TABLE_DEFAULTS, ...opts };
  if (!container) return;
  const tbody = container.querySelector(`#${escapeHtml(o.tbodyId)}`);
  if (!tbody) return;
  const body = computeTableBody(o.loading, o.rowsHtml, o.emptyMessage, o.emptyColSpan);
  if (tbody.innerHTML !== body) {
    tbody.innerHTML = body;
  }
}

// -- syncModelsPaginationState helpers --

const SYNC_PAGINATION_DEFAULTS = Object.freeze({
  pageSizeId: 'page-size-select',
  limit: PAGE_SIZE_TWENTY,
  pageStart: 0,
  pageEnd: 0,
  pageTotal: 0,
  currentPage: 1,
  totalPages: 1,
  loading: false,
  usingFilter: false,
  prevId: 'prev-page',
  nextId: 'next-page',
});

function setPageRangeText(container, pageStart, pageEnd, pageTotal) {
  const rangeEl = container.querySelector('[data-models-page-range]');
  if (rangeEl) {
    rangeEl.textContent = `${pageStart}-${pageEnd} of ${pageTotal}`;
  }
}

function setPageText(container, currentPage, totalPages) {
  const pageText = container.querySelector('[data-models-page-text]');
  if (pageText) {
    pageText.textContent = `Page ${currentPage} / ${totalPages}`;
  }
}

function syncPageSizeSelect(container, pageSizeId, limit) {
  const pageSize = container.querySelector(`#${escapeHtml(pageSizeId)}`);
  if (pageSize && String(pageSize.value) !== String(limit)) {
    pageSize.value = String(limit);
  }
}

function setButtonDisabledStates(container, state) {
  const prevBtn = container.querySelector(`#${escapeHtml(state.prevId)}`);
  if (prevBtn) {
    prevBtn.disabled = Boolean(state.usingFilter || state.loading || state.pageStart <= 1);
  }
  const nextBtn = container.querySelector(`#${escapeHtml(state.nextId)}`);
  if (nextBtn) {
    nextBtn.disabled = Boolean(
      state.usingFilter || state.loading || state.pageEnd >= state.pageTotal
    );
  }
}

export function syncModelsPaginationState(container, opts) {
  const o = { ...SYNC_PAGINATION_DEFAULTS, ...opts };
  if (!container) return;
  setPageRangeText(container, o.pageStart, o.pageEnd, o.pageTotal);
  setPageText(container, o.currentPage, o.totalPages);
  syncPageSizeSelect(container, o.pageSizeId, o.limit);
  setButtonDisabledStates(container, o);
}
