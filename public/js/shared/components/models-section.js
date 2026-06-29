import { renderSearchBarHtml } from './search-bar.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export function renderModelsHeaderHtml({
  countTitle = 'Active models',
  countLabel = '',
  countValue = '',
  searchId,
  searchValue = '',
  clearId,
  clearButtonId = '',
  clearHidden = true,
  providerId,
  _providerValue = 'all',
  providerOptionsMarkup = '',
  searchPlaceholder = 'Search models',
}) {
  return `
    <div class="pt-0.5 pb-2.5 flex flex-col gap-3 lg:flex-row lg:justify-between lg:items-center bg-white">
      <div class="flex items-center text-xl font-medium px-0.5 gap-2">
        <div class="flex-shrink-0 text-gray-900">Models</div>
        <div class="flex flex-col items-start leading-tight">
          ${countLabel ? `<div data-models-count-label class="text-label-sm font-semibold uppercase tracking-[0.18em] text-gray-400">${escapeHtml(countLabel)}</div>` : ''}
          <div data-models-count-value class="text-gray-500 font-normal${countLabel ? '' : ' ml-0.5'}" title="${escapeHtml(countTitle)}">${escapeHtml(countValue)}</div>
        </div>
      </div>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:flex-wrap">
        ${renderSearchBarHtml({
          inputId: searchId,
          value: searchValue,
          placeholder: searchPlaceholder,
          clearId,
          clearButtonId,
          clearHidden,
        })}
        <select id="${escapeHtml(providerId)}" class="w-full sm:w-auto min-w-0 rounded-md border border-gray-100/30 bg-gray-50/50 px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300">
          ${providerOptionsMarkup}
        </select>
      </div>
    </div>
  `;
}

export function renderModelsTableShellHtml({
  loading,
  rowsHtml,
  emptyMessage,
  _usingFilter = false,
  tbodyId = 'models-table-body',
  emptyColSpan = 4,
}) {
  const body = loading
    ? rowsHtml
    : rowsHtml ||
      `
      <tr>
        <td colspan="${emptyColSpan}" class="py-10 text-center text-sm text-gray-400">
          ${escapeHtml(emptyMessage || 'No models found.')}
        </td>
      </tr>
    `;

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
            <tbody id="${escapeHtml(tbodyId)}" class="divide-y divide-gray-50/50">
              ${body}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function renderModelsPaginationHtml({
  pageSizeId = 'page-size-select',
  limit = 20,
  pageStart = 0,
  pageEnd = 0,
  pageTotal = 0,
  currentPage = 1,
  totalPages = 1,
  loading = false,
  usingFilter = false,
  prevId = 'prev-page',
  nextId = 'next-page',
}) {
  return `
    <div class="shrink-0 border-t border-gray-100 bg-white shadow-[0_-1px_0_rgba(17,24,39,0.04)]" data-models-pagination>
      <div class="flex items-center justify-between gap-4 py-4 px-0.5 text-sm text-gray-500">
        <div class="flex items-center gap-3">
          <span>Show</span>
          <select id="${escapeHtml(pageSizeId)}" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300" ${loading ? 'disabled' : ''}>
            <option value="20" ${limit === 20 ? 'selected' : ''}>20</option>
            <option value="50" ${limit === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${limit === 100 ? 'selected' : ''}>100</option>
          </select>
          <span>per page</span>
        </div>
        <div class="flex items-center gap-4">
          <div data-models-page-range class="text-xs text-gray-400">${escapeHtml(pageStart)}-${escapeHtml(pageEnd)} of ${escapeHtml(pageTotal)}</div>
          <div class="flex items-center gap-2">
            <button id="${escapeHtml(prevId)}" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" ${usingFilter || loading || pageStart <= 1 ? 'disabled' : ''}>Prev</button>
            <div data-models-page-text class="text-sm text-gray-600">Page ${escapeHtml(currentPage)} / ${escapeHtml(totalPages)}</div>
            <button id="${escapeHtml(nextId)}" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" ${usingFilter || loading || pageEnd >= pageTotal ? 'disabled' : ''}>Next</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function syncModelsHeaderState(
  container,
  {
    countTitle = 'Active models',
    _countLabel = '',
    countValue = '',
    searchId,
    searchValue = '',
    clearId,
    clearButtonId = '',
    clearHidden = true,
    providerId,
    providerOptionsMarkup = '',
    providerValue = 'all',
  } = {}
) {
  if (!container) return;
  const countEl = container.querySelector('[data-models-count-value]');
  if (countEl) {
    countEl.textContent = String(countValue ?? '');
    countEl.title = countTitle;
  }

  const searchInput = searchId ? container.querySelector(`#${escapeHtml(searchId)}`) : null;
  if (
    searchInput &&
    document.activeElement !== searchInput &&
    searchInput.value !== String(searchValue ?? '')
  ) {
    searchInput.value = String(searchValue ?? '');
  }

  const clearWrap = clearId ? container.querySelector(`#${escapeHtml(clearId)}`) : null;
  if (clearWrap) {
    clearWrap.classList.toggle('hidden', Boolean(clearHidden));
  }

  const clearBtn = clearButtonId ? container.querySelector(`#${escapeHtml(clearButtonId)}`) : null;
  if (clearBtn) {
    clearBtn.disabled = false;
  }

  const providerSelect = providerId ? container.querySelector(`#${escapeHtml(providerId)}`) : null;
  if (providerSelect) {
    const currentValue = String(providerValue ?? 'all');
    if (providerSelect.value !== currentValue) {
      providerSelect.value = currentValue;
    }
    if (providerOptionsMarkup) {
      const nextHtml = providerOptionsMarkup.trim();
      if (providerSelect.innerHTML.trim() !== nextHtml) {
        providerSelect.innerHTML = providerOptionsMarkup;
        providerSelect.value = currentValue;
      }
    }
  }
}

export function syncModelsTableState(
  container,
  {
    loading,
    rowsHtml,
    emptyMessage,
    _usingFilter = false,
    tbodyId = 'models-table-body',
    emptyColSpan = 4,
  } = {}
) {
  if (!container) return;
  const tbody = container.querySelector(`#${escapeHtml(tbodyId)}`);
  if (!tbody) return;
  const body = loading
    ? rowsHtml
    : rowsHtml ||
      `
      <tr>
        <td colspan="${emptyColSpan}" class="py-10 text-center text-sm text-gray-400">
          ${escapeHtml(emptyMessage || 'No models found.')}
        </td>
      </tr>
    `;
  if (tbody.innerHTML !== body) {
    tbody.innerHTML = body;
  }
}

export function syncModelsPaginationState(
  container,
  {
    pageSizeId = 'page-size-select',
    limit = 20,
    pageStart = 0,
    pageEnd = 0,
    pageTotal = 0,
    currentPage = 1,
    totalPages = 1,
    loading = false,
    usingFilter = false,
    prevId = 'prev-page',
    nextId = 'next-page',
  } = {}
) {
  if (!container) return;
  const rangeEl = container.querySelector('[data-models-page-range]');
  if (rangeEl) {
    rangeEl.textContent = `${pageStart}-${pageEnd} of ${pageTotal}`;
  }

  const pageText = container.querySelector('[data-models-page-text]');
  if (pageText) {
    pageText.textContent = `Page ${currentPage} / ${totalPages}`;
  }

  const pageSize = container.querySelector(`#${escapeHtml(pageSizeId)}`);
  if (pageSize && String(pageSize.value) !== String(limit)) {
    pageSize.value = String(limit);
  }

  const prevBtn = container.querySelector(`#${escapeHtml(prevId)}`);
  if (prevBtn) {
    prevBtn.disabled = Boolean(usingFilter || loading || pageStart <= 1);
  }

  const nextBtn = container.querySelector(`#${escapeHtml(nextId)}`);
  if (nextBtn) {
    nextBtn.disabled = Boolean(usingFilter || loading || pageEnd >= pageTotal);
  }
}
