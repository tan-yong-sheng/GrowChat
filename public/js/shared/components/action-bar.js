/**
 * Renders an action bar with save/cancel buttons
 * Used consistently across admin and account settings pages
 */
import { renderButton } from './button.js';

export function renderActionBar({ isSaving = false, helpText = '', showDelete = false } = {}) {
  return `
    <div class="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 bg-white">
      <div class="text-xs text-gray-400">
        ${helpText}
      </div>
      <div class="flex items-center gap-2">
        ${
          showDelete
            ? renderButton({
                label: 'Delete',
                variant: 'secondary',
                className: 'border-red-100 text-red-600 hover:bg-red-50',
                disabled: isSaving,
                ariaLabel: 'Delete',
              })
            : ''
        }
        ${renderButton({
          label: 'Cancel',
          variant: 'secondary',
          disabled: isSaving,
          ariaLabel: 'Cancel',
        })}
        ${renderButton({
          label: isSaving ? 'Saving...' : 'Save',
          variant: 'primary',
          disabled: isSaving,
          ariaLabel: 'Save',
        })}
      </div>
    </div>
  `;
}

/**
 * Renders a sticky footer action bar for settings pages
 */
export function renderStickyActionBar({ isSaving = false, helpText = '' } = {}) {
  return `
    <div class="sticky bottom-0 left-0 right-0 flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-4 bg-white shadow-lg">
      <div class="text-xs text-gray-400">
        ${helpText}
      </div>
      <div class="flex items-center gap-2">
        ${renderButton({
          label: 'Cancel',
          variant: 'secondary',
          disabled: isSaving,
          ariaLabel: 'Cancel',
        })}
        ${renderButton({
          label: isSaving ? 'Saving...' : 'Save',
          variant: 'primary',
          disabled: isSaving,
          ariaLabel: 'Save',
        })}
      </div>
    </div>
  `;
}
