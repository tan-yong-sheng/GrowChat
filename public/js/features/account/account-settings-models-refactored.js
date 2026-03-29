/**
 * EXAMPLE: Refactored account-settings-models.js using shared components
 * Shows how to apply table and status badge components for parity with admin
 */

import { renderStatusBadge, renderDataTable, renderEmptyState } from '../../shared/components/status-badge.js';
import { renderSectionHeader, renderSettingsPageLayout, renderSubsection } from '../../shared/components/section-header.js';
import { renderSettingsShell } from '../../shared/components/settings-shell.js';
import { renderSettingsNav } from '../../shared/components/settings-nav.js';

export function renderAccountSettingsModelsSection(container, state = {}) {
  const settings = state.settings || {};
  const models = settings.models || [];

  const render = () => {
    const navPane = renderSettingsNav({
      items: [
        { label: 'General', href: '/account/settings/general' },
        { label: 'Connections', href: '/account/settings/connections' },
        { label: 'Models', href: '/account/settings/models', active: true },
        { label: 'Integrations', href: '/account/settings/integrations' },
      ],
    });

    const header = renderSectionHeader({
      label: 'ACCOUNT SETTINGS',
      title: 'Models',
      subtitle: 'View available models and set your defaults',
    });

    // Personal models section
    const personalModels = models.filter(m => m.scope === 'personal');
    const personalContent = personalModels.length
      ? renderDataTable({
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'model_id', label: 'Model ID' },
            { key: 'availability', label: 'Availability' },
          ],
          rows: personalModels.map(m => ({
            id: m.id,
            name: m.name,
            model_id: m.model_id,
            availability: renderStatusBadge({ text: 'Enabled', tone: 'green' }),
          })),
        })
      : renderEmptyState({
          title: 'No Personal Models',
          message: 'You haven\'t added any personal models yet.',
        });

    // Available models section (from admin)
    const availableModels = models.filter(m => m.scope === 'admin');
    const availableContent = availableModels.length
      ? renderDataTable({
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'model_id', label: 'Model ID' },
            { key: 'status', label: 'Status' },
          ],
          rows: availableModels.map(m => ({
            id: m.id,
            name: m.name,
            model_id: m.model_id,
            status: renderStatusBadge({ text: 'Available', tone: 'blue' }),
          })),
        })
      : renderEmptyState({
          title: 'No Available Models',
          message: 'No models are currently available from admin.',
        });

    const content = `
      ${renderSubsection({
        label: 'PERSONAL MODELS',
        description: 'Models you\'ve configured for your account',
        content: personalContent,
      })}

      <div class="mt-6"></div>

      ${renderSubsection({
        label: 'AVAILABLE MODELS',
        description: 'Models provided by your administrator',
        content: availableContent,
      })}
    `;

    const shellHtml = renderSettingsShell({
      navPaneHtml: navPane,
      contentHtml: renderSettingsPageLayout({
        header,
        content,
      }),
    });

    container.innerHTML = shellHtml;
  };

  render();
}
