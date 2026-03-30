import { fetchModels } from '../../shared/api.js';
import { renderSettingsActionFooter } from '../../shared/components/settings-action-footer.js';
import { buildProviderOptions, filterModelsBySearchAndProvider } from '../../shared/utils/model-filters.js';
import { normalizeModelSearchQuery } from '../../shared/utils/model-search.js';
import { countEnabledModels, sortModelsByActiveThenName } from '../../shared/utils/model-state.js';
import { renderErrorBanner } from '../../shared/components/section-header.js';
import { ATTACHMENT_CAP_TYPES, getAttachmentCapTooltip, getAttachmentCapValue } from '../admin/settings/models-helpers.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeAttachmentCaps(attachments = {}) {
  const next = {};
  ATTACHMENT_CAP_TYPES.forEach(({ key }) => {
    next[key] = Boolean(attachments?.[key]);
  });
  return next;
}

function normalizeModelRecord(model = {}) {
  const id = String(model?.id || model?.modelId || model?.name || '').trim();
  if (!id) return null;
  return {
    ...model,
    id,
    name: String(model?.name || model?.displayName || model?.id || id).trim() || id,
    enabled: model?.enabled !== false,
    attachments: normalizeAttachmentCaps(model?.attachments),
  };
}

function renderLoadingRows() {
  return Array.from({ length: 5 }).map(() => `
    <tr class="bg-white text-xs animate-pulse">
      <td class="px-4 py-4"><div class="h-4 w-32 rounded bg-gray-100"></div></td>
      <td class="px-4 py-4"><div class="h-4 w-40 rounded bg-gray-100"></div></td>
      <td class="px-4 py-4">
        <div class="flex flex-wrap items-center gap-1.5">
          <div class="h-6 w-10 rounded-full bg-gray-100"></div>
          <div class="h-6 w-10 rounded-full bg-gray-100"></div>
        </div>
      </td>
      <td class="px-4 py-4 text-right">
        <div class="ml-auto h-5 w-9 rounded-full bg-gray-100"></div>
      </td>
    </tr>
  `).join('');
}

function renderAttachmentCaps(model) {
  return ATTACHMENT_CAP_TYPES.map(({ key, short, label }) => {
    const value = getAttachmentCapValue({ [model.id]: model.attachments }, model.id, key);
    const state = value ? 'allowed' : 'unset';
    const className = value
      ? 'bg-emerald-500 text-white border-emerald-500'
      : 'bg-gray-50 text-gray-500 border-gray-200';
    const tooltip = getAttachmentCapTooltip(label, key, state);
    return `
      <button
        type="button"
        disabled
        aria-disabled="true"
        data-cap-model="${escapeHtml(model.id)}"
        data-cap-kind="${escapeHtml(key)}"
        data-cap-label="${escapeHtml(label)}"
        data-cap-state="${escapeHtml(state)}"
        title="${escapeHtml(tooltip)}"
        class="inline-flex items-center justify-center h-6 min-w-[36px] px-2 rounded-full text-[10px] font-semibold border transition ${className}"
      >
        ${escapeHtml(short)}
      </button>
    `;
  }).join('');
}

function renderModelRow(model) {
  const enabled = model.enabled !== false;
  return `
    <tr data-model-row="${escapeHtml(model.id)}" class="bg-white text-xs hover:bg-gray-50/50 transition-colors ${enabled ? '' : 'bg-gray-50/80 opacity-70'}">
      <td class="px-4 py-4 font-medium text-gray-900 truncate" title="${escapeHtml(model.name || model.id)}">${escapeHtml(model.name || model.id)}</td>
      <td class="px-4 py-4 text-gray-400 font-mono truncate ${enabled ? '' : 'text-gray-300'}" title="${escapeHtml(model.id)}">${escapeHtml(model.id)}</td>
      <td class="px-4 py-4">
        <div class="flex flex-wrap items-center gap-1.5">
          ${renderAttachmentCaps(model)}
        </div>
      </td>
      <td class="px-4 py-4 text-right">
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="model-toggle relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enabled ? 'bg-black' : 'bg-gray-200'}"
            data-model-id="${escapeHtml(model.id)}"
            title="${enabled ? 'Model enabled' : 'Model disabled'}"
            aria-pressed="${enabled ? 'true' : 'false'}"
          >
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-4' : 'translate-x-0'}"></span>
          </button>
        </div>
      </td>
    </tr>
  `;
}

export function renderAccountModelsSection(container, state = {}, { onRefresh, footerHost } = {}) {
  const sectionState = {
    loading: true,
    error: '',
    models: [],
    providerOptions: [],
    query: '',
    provider: 'all',
  };

  const render = () => {
    const query = normalizeModelSearchQuery(sectionState.query);
    const filteredModels = filterModelsBySearchAndProvider(sectionState.models, {
      query,
      provider: sectionState.provider,
    });
    const providerOptions = sectionState.providerOptions.length
      ? sectionState.providerOptions
      : buildProviderOptions(sectionState.models, { includeAll: true });
    const activeTotal = countEnabledModels(sectionState.models);

    const pageTotal = filteredModels.length;
    const pageStart = pageTotal === 0 ? 0 : 1;
    const pageEnd = pageTotal;
    const tableBody = sectionState.loading
      ? renderLoadingRows()
      : filteredModels.length
        ? filteredModels.map((model) => renderModelRow(model)).join('')
        : `
          <tr>
            <td colspan="4" class="py-10 text-center text-sm text-gray-400">
              No models found${query ? ` matching "${escapeHtml(sectionState.query)}"` : ''}.
            </td>
          </tr>
        `;

    container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        ${sectionState.error ? renderErrorBanner({ message: sectionState.error }) : ''}
        <div class="pt-0.5 pb-2.5 flex justify-between items-center sticky top-0 z-10 bg-white">
          <div class="flex items-center text-xl font-medium px-0.5 gap-2">
            <div class="flex-shrink-0 text-gray-900">Models</div>
            <div class="text-gray-500 font-normal ml-0.5" title="Active models">${activeTotal}</div>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-1.5 bg-gray-50/50 px-3 py-1.5 rounded-xl border border-gray-100/30 w-64">
              <div class="flex-shrink-0 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                  <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                </svg>
              </div>
              <input
                class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400"
                placeholder="Search models"
                id="account-model-search-input"
                value="${escapeHtml(sectionState.query)}"
              >
              <div id="model-clear-search-container" class="${sectionState.query ? '' : 'hidden'} ml-1.5">
                <button type="button" id="model-clear-search-btn" class="p-0.5 rounded-full hover:bg-gray-200 transition" aria-label="Clear search">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <select
              id="account-model-provider-select"
              class="rounded-xl border border-gray-100/30 bg-gray-50/50 px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300"
            >
              ${providerOptions.map((option) => `
                <option value="${escapeHtml(option.value)}" ${option.value === sectionState.provider ? 'selected' : ''}>
                  ${escapeHtml(option.label)}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-hidden pb-6">
          <div class="relative flex-1 min-h-0 overflow-hidden w-full rounded-3xl border border-gray-100 bg-white">
            <div class="h-full overflow-auto" data-models-scroll="1">
              <table class="w-full text-sm text-left text-gray-500 table-fixed">
                <thead class="text-[11px] text-gray-900 font-bold uppercase bg-gray-50/50 sticky top-0 z-10">
                  <tr class="border-b border-gray-100">
                    <th scope="col" class="px-4 py-3 w-1/4">Name</th>
                    <th scope="col" class="px-4 py-3 w-1/3">Model ID</th>
                    <th scope="col" class="px-4 py-3 w-1/3">Input</th>
                    <th scope="col" class="px-4 py-3 w-1/6 text-right">Status</th>
                  </tr>
                </thead>
                <tbody id="account-models-table-body" class="divide-y divide-gray-50/50">
                  ${tableBody}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="shrink-0 border-t border-gray-100 bg-white">
          <div class="flex items-center justify-between gap-4 py-4 px-0.5 text-sm text-gray-500">
            <div class="flex items-center gap-3">
              <span>Show</span>
              <select class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300" disabled>
                <option selected>20</option>
                <option>50</option>
                <option>100</option>
              </select>
              <span>per page</span>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-xs text-gray-400">${pageStart}-${pageEnd} of ${pageTotal}</div>
              <div class="flex items-center gap-2">
                <button class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" disabled>Prev</button>
                <div class="text-sm text-gray-600">Page 1 / 1</div>
                <button class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" disabled>Next</button>
              </div>
            </div>
          </div>
          <div id="models-feedback" class="hidden mt-2 rounded-xl border px-4 py-3 text-sm"></div>
        </div>
      </div>
    `;

    if (footerHost) {
      footerHost.innerHTML = renderSettingsActionFooter({
        footerId: 'models-action-footer',
        dirtyId: 'models-dirty',
        saveId: 'save-models-top',
      });
    }

    container.querySelector('#account-model-search-input')?.addEventListener('input', (event) => {
      sectionState.query = event.target.value;
      render();
    });

    container.querySelector('#model-clear-search-btn')?.addEventListener('click', () => {
      sectionState.query = '';
      render();
    });

    container.querySelector('#account-model-provider-select')?.addEventListener('change', (event) => {
      sectionState.provider = event.target.value || 'all';
      render();
    });

    container.querySelectorAll('.model-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modelId = btn.getAttribute('data-model-id');
        const model = sectionState.models.find((item) => item.id === modelId);
        if (!model) return;
        model.enabled = model.enabled === false;
        render();
      });
    });
  };

  const load = async () => {
    sectionState.loading = true;
    sectionState.error = '';
    render();
    try {
      const payload = await fetchModels({ cache: 'no-store' });
      const models = Array.isArray(payload?.models)
        ? payload.models.map(normalizeModelRecord).filter(Boolean)
        : [];
      sectionState.models = sortModelsByActiveThenName(models);
      sectionState.providerOptions = buildProviderOptions(sectionState.models, { includeAll: true });
    } catch (err) {
      sectionState.error = err?.message || 'Failed to load models';
    } finally {
      sectionState.loading = false;
      render();
    }
  };

  render();
  load();
}
