/**
 * EXAMPLE: Refactored account-settings-general.js using shared components
 * This shows how to apply form components to achieve parity with admin pages
 */

import { renderFormInput, renderFormSelect, renderFormCheckbox } from '../../shared/components/form-label-with-helper.js';
import { renderSectionHeader, renderSettingsPageLayout, renderErrorBanner } from '../../shared/components/section-header.js';
import { renderStickyActionBar } from '../../shared/components/action-bar.js';
import { renderSettingsShell } from '../../shared/components/settings-shell.js';
import { renderSettingsNav } from '../../shared/components/settings-nav.js';

export function renderAccountSettingsGeneralSection(container, state = {}, { onRefresh } = {}) {
  const user = state.user || {};
  const settings = state.settings || {};

  let isSaving = false;
  let error = '';

  const render = () => {
    const navPane = renderSettingsNav({
      items: [
        { label: 'General', href: '/account/settings/general', active: true },
        { label: 'Connections', href: '/account/settings/connections' },
        { label: 'Models', href: '/account/settings/models' },
        { label: 'Integrations', href: '/account/settings/integrations' },
      ],
    });

    const header = renderSectionHeader({
      label: 'ACCOUNT SETTINGS',
      title: 'General',
      subtitle: 'Manage your account preferences and defaults',
    });

    const content = `
      ${error ? renderErrorBanner({ message: error }) : ''}

      <form id="account-settings-general-form" class="space-y-6">
        <div class="space-y-4">
          ${renderFormInput({
            name: 'name',
            label: 'Full Name',
            helper: 'Your display name across the application',
            value: user.name || '',
            placeholder: 'John Doe',
            required: true,
          })}
        </div>

        <div class="space-y-4">
          ${renderFormSelect({
            name: 'theme',
            label: 'Theme Preference',
            helper: 'Choose how the interface appears',
            value: settings.theme || 'auto',
            options: [
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'auto', label: 'Auto (System)' },
            ],
          })}
        </div>

        <div class="space-y-4">
          ${renderFormSelect({
            name: 'language',
            label: 'Language',
            helper: 'Select your preferred language',
            value: settings.language || 'en',
            options: [
              { value: 'en', label: 'English' },
              { value: 'zh', label: '中文' },
              { value: 'ja', label: '日本語' },
            ],
          })}
        </div>

        <div class="space-y-4">
          ${renderFormCheckbox({
            name: 'notifications_enabled',
            label: 'Enable Notifications',
            helper: 'Receive notifications for important events',
            checked: settings.notifications_enabled !== false,
          })}
        </div>

        <div data-error-container class="hidden">
          ${renderErrorBanner({ message: '' })}
        </div>
      </form>
    `;

    const footer = renderStickyActionBar({
      isSaving,
      helpText: 'Save your changes to update your account settings.',
    });

    const shellHtml = renderSettingsShell({
      navPaneHtml: navPane,
      contentHtml: renderSettingsPageLayout({
        header,
        content,
        footer,
      }),
    });

    container.innerHTML = shellHtml;

    // Event listeners
    const form = container.querySelector('#account-settings-general-form');
    const saveBtn = container.querySelector('[data-action-save]');
    const cancelBtn = container.querySelector('[data-action-cancel]');

    saveBtn?.addEventListener('click', async () => {
      if (isSaving) return;
      isSaving = true;
      error = '';

      try {
        const formData = new FormData(form);
        const payload = {
          name: formData.get('name'),
          settings: {
            theme: formData.get('theme'),
            language: formData.get('language'),
            notifications_enabled: formData.get('notifications_enabled') === 'on',
          },
        };

        // Call API to save
        const response = await fetch('/api/users/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error('Failed to save settings');

        // Refresh state
        if (typeof onRefresh === 'function') {
          const nextState = await onRefresh();
          if (nextState) {
            state.user = nextState.user;
            state.settings = nextState.settings;
          }
        }

        render();
      } catch (err) {
        error = err?.message || 'Failed to save settings';
        render();
      } finally {
        isSaving = false;
      }
    });

    cancelBtn?.addEventListener('click', () => {
      render(); // Reset form
    });
  };

  render();
}
