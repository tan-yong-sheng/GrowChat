import { fetchModels } from '../../shared/api.js';
import { buildProviderOptions, filterModelsBySearchAndProvider } from '../../shared/utils/model-filters.js';
import { normalizeModelSearchQuery } from '../../shared/utils/model-search.js';
import { sortModelsByActiveThenName } from '../../shared/utils/model-state.js';
import { renderStatusBadge, renderDataTable, renderEmptyState } from '../../shared/components/status-badge.js';
import { renderSectionHeader, renderSettingsPageLayout, renderSubsection } from '../../shared/components/section-header.js';
import { renderSettingsShell } from '../../shared/components/settings-shell.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeModelRecord(model = {}) {
  const id = String(model?.id || model?.modelId || model?.name || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(model?.name || model?.displayName || model?.id || id).trim() || id,
  };
}

export function renderAccountModelsSection(container, state = {}, { onRefresh } = {}) {
  const sectionState = {
    loading: true,
    saving: false,
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

    const header = renderSectionHeader({
      label: 'ACCOUNT SETTINGS',
      title: 'Models',
      subtitle: 'View available models and their status',
    });

    const modelRows = filteredModels.map((model) => ({
      id: model.id,
      name: model.name || model.id,
      model_id: model.id,
      availability: renderStatusBadge({
        text: model.enabled !== false ? 'Enabled' : 'Disabled',
        tone: model.enabled !== false ? 'green' : 'amber'
      }),
    }));

    const tableContent = modelRows.length
      ? renderDataTable({
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'model_id', label: 'Model ID' },
            { key: 'availability', label: 'Availability' },
          ],
          rows: modelRows,
        })
      : renderEmptyState({
          title: 'No Models Available',
          message: 'No models are currently available.',
        });

    const content = `
      ${renderSubsection({
        label: 'AVAILABLE MODELS',
        description: 'Models available for use in your account',
        content: tableContent,
      })}
    `;

    const shellHtml = renderSettingsShell({
      contentHtml: renderSettingsPageLayout({
        header,
        content,
      }),
    });

    container.innerHTML = shellHtml;
  };

  const load = async () => {
    sectionState.loading = true;
    sectionState.error = '';
    render();
    try {
      const payload = await fetchModels({ cache: 'no-store' });
      const models = Array.isArray(payload?.models) ? payload.models.map(normalizeModelRecord).filter(Boolean) : [];
      sectionState.models = sortModelsByActiveThenName(models);
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
