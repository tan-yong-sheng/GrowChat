/**
 * EXAMPLE: Refactored account-settings-integrations.js using shared components
 * Shows how to apply list item cards and modals for parity with admin
 */

import { renderListItemCard, renderEmptyState } from '../../shared/components/status-badge.js';
import { renderSectionHeader, renderSettingsPageLayout, renderSubsection, renderErrorBanner } from '../../shared/components/section-header.js';
import { renderFormInput, renderFormCheckbox } from '../../shared/components/form-label-with-helper.js';
import { renderActionBar } from '../../shared/components/action-bar.js';
import { createSettingsModalShell } from '../../shared/components/settings-modal-shell.js';
import { renderSettingsShell } from '../../shared/components/settings-shell.js';
import { renderSettingsNav } from '../../shared/components/settings-nav.js';

export function renderAccountSettingsIntegrationsSection(container, state = {}, { onRefresh } = {}) {
  const settings = state.settings || {};
  const integrations = settings.integrations || {};

  let isSaving = false;
  let error = '';
  let activeModal = null;

  const closeModal = () => {
    activeModal?.remove();
    activeModal = null;
  };

  const openIntegrationModal = (integration = null) => {
    closeModal();
    const isEdit = Boolean(integration?.id);
    const title = isEdit ? 'Edit Integration' : 'Add Integration';
    const subtitle = isEdit
      ? `${integration.name || integration.id || 'Integration'} · Personal resource`
      : 'Create a personal MCP server integration.';

    const { modal, overlay, closeBtn, bodyEl } = createSettingsModalShell({
      rootId: 'account-integration-modal',
      title,
      subtitle,
      body: `
        <form id="account-integration-form" class="space-y-4 p-5 sm:p-6">
          ${renderFormInput({
            name: 'name',
            label: 'Name',
            helper: 'Display name for this integration',
            value: integration?.name || '',
            placeholder: 'My MCP Server',
            required: true,
          })}

          ${renderFormInput({
            name: 'url',
            label: 'Server URL',
            helper: 'The endpoint URL for your MCP server',
            value: integration?.url || '',
            placeholder: 'http://localhost:3000',
            required: true,
          })}

          ${renderFormCheckbox({
            name: 'enabled',
            label: 'Enabled',
            helper: 'Enable this integration for use',
            checked: integration?.enabled !== false,
          })}

          <div data-account-integration-form-error class="hidden">
            ${renderErrorBanner({ message: '' })}
          </div>
        </form>
      `,
      footer: renderActionBar({
        helpText: isEdit ? 'Update the integration details and save changes.' : 'Create a new personal integration.',
        showDelete: isEdit,
      }),
    });

    activeModal = modal;
    const form = bodyEl?.querySelector('#account-integration-form');
    const errorEl = bodyEl?.querySelector('[data-account-integration-form-error]');
    const saveBtn = modal.querySelector('[data-action-save]');
    const deleteBtn = modal.querySelector('[data-action-delete]');
    const cancelBtn = modal.querySelector('[data-action-cancel]');

    const setError = (message) => {
      if (!errorEl) return;
      if (!message) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
        return;
      }
      errorEl.innerHTML = renderErrorBanner({ message });
      errorEl.classList.remove('hidden');
    };

    const setSaving = (saving) => {
      isSaving = saving;
      if (saveBtn) {
        saveBtn.disabled = saving;
        saveBtn.textContent = saving ? 'Saving...' : 'Save';
      }
      if (deleteBtn) {
        deleteBtn.disabled = saving;
      }
    };

    const saveIntegration = async () => {
      if (!form) return;
      const formData = new FormData(form);
      const name = String(formData.get('name') || '').trim();
      const url = String(formData.get('url') || '').trim();
      const enabled = formData.get('enabled') === 'on';

      if (!name) throw new Error('Name is required');
      if (!url) throw new Error('URL is required');

      const payload = { name, url, enabled };

      if (isEdit) {
        // Call API to update
        const response = await fetch(`/api/users/me/integrations/${integration.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to update integration');
      } else {
        // Call API to create
        const response = await fetch('/api/users/me/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to create integration');
      }
    };

    saveBtn?.addEventListener('click', async () => {
      if (isSaving) return;
      setError('');
      setSaving(true);
      try {
        await saveIntegration();
        closeModal();
        if (typeof onRefresh === 'function') {
          const nextState = await onRefresh();
          if (nextState) {
            state.settings = nextState.settings;
          }
        }
        render();
      } catch (err) {
        setError(err?.message || 'Failed to save integration');
      } finally {
        setSaving(false);
      }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (isSaving || !isEdit) return;
      if (!window.confirm(`Delete integration ${integration.name || integration.id}? This cannot be undone.`)) return;
      setError('');
      setSaving(true);
      try {
        const response = await fetch(`/api/users/me/integrations/${integration.id}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete integration');
        closeModal();
        if (typeof onRefresh === 'function') {
          const nextState = await onRefresh();
          if (nextState) {
            state.settings = nextState.settings;
          }
        }
        render();
      } catch (err) {
        setError(err?.message || 'Failed to delete integration');
      } finally {
        setSaving(false);
      }
    });

    cancelBtn?.addEventListener('click', closeModal);
    closeBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', closeModal);

    document.body.appendChild(modal);
    return modal;
  };

  const render = () => {
    const navPane = renderSettingsNav({
      items: [
        { label: 'General', href: '/account/settings/general' },
        { label: 'Connections', href: '/account/settings/connections' },
        { label: 'Models', href: '/account/settings/models' },
        { label: 'Integrations', href: '/account/settings/integrations', active: true },
      ],
    });

    const header = renderSectionHeader({
      label: 'ACCOUNT SETTINGS',
      title: 'Integrations',
      subtitle: 'Manage your MCP servers and integrations',
      actionButton: { label: 'Add Integration', key: 'add-integration' },
    });

    const personalIntegrations = Array.isArray(integrations.my_integrations)
      ? integrations.my_integrations
      : [];

    const personalContent = personalIntegrations.length
      ? personalIntegrations.map(integration => renderListItemCard({
          title: integration.name || integration.id,
          subtitle: integration.url,
          badges: [
            { text: integration.enabled ? 'Enabled' : 'Disabled', tone: integration.enabled ? 'green' : 'amber' },
          ],
          actions: [
            { label: 'Edit', key: 'edit', className: 'border border-gray-200 text-gray-700 hover:bg-gray-50' },
            { label: 'Delete', key: 'delete', className: 'border border-red-100 text-red-600 hover:bg-red-50' },
          ],
        })).join('')
      : renderEmptyState({
          title: 'No Personal Integrations',
          message: 'Add your first MCP server integration to get started.',
        });

    const content = `
      ${error ? renderErrorBanner({ message: error }) : ''}

      ${renderSubsection({
        label: 'MCP SERVERS',
        description: 'Your personal MCP server integrations',
        content: personalContent,
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

    // Event listeners
    container.querySelector('[data-action="add-integration"]')?.addEventListener('click', () => {
      openIntegrationModal(null);
    });

    container.querySelectorAll('[data-list-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const integration = personalIntegrations.find(i => i.id === btn.closest('[data-list-action]')?.dataset.id);
        if (integration) openIntegrationModal(integration);
      });
    });

    container.querySelectorAll('[data-list-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const integrationId = btn.closest('[data-list-action]')?.dataset.id;
        const integration = personalIntegrations.find(i => i.id === integrationId);
        if (!integration) return;
        if (!window.confirm(`Delete integration ${integration.name || integration.id}? This cannot be undone.`)) return;
        error = '';
        try {
          const response = await fetch(`/api/users/me/integrations/${integration.id}`, {
            method: 'DELETE',
          });
          if (!response.ok) throw new Error('Failed to delete integration');
          if (typeof onRefresh === 'function') {
            const nextState = await onRefresh();
            if (nextState) {
              state.settings = nextState.settings;
            }
          }
          render();
        } catch (err) {
          error = err?.message || 'Failed to delete integration';
          render();
        }
      });
    });
  };

  render();
}
