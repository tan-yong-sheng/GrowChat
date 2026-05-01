/**
 * Renders an action bar with save/cancel buttons
 * Used consistently across admin and account settings pages
 */
export function renderActionBar({ isSaving = false, helpText = '', showDelete = false } = {}) {
  return `
    <div class="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 bg-white">
      <div class="text-xs text-gray-400">
        ${helpText}
      </div>
      <div class="flex items-center gap-2">
        ${
          showDelete
            ? `
          <button
            type="button"
            data-action-delete
            class="rounded-full border border-red-100 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
            ${isSaving ? 'disabled' : ''}
          >
            Delete
          </button>
        `
            : ''
        }
        <button
          type="button"
          data-action-cancel
          class="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
          ${isSaving ? 'disabled' : ''}
        >
          Cancel
        </button>
        <button
          type="button"
          data-action-save
          class="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
          ${isSaving ? 'disabled' : ''}
        >
          ${isSaving ? 'Saving...' : 'Save'}
        </button>
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
        <button
          type="button"
          data-action-cancel
          class="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
          ${isSaving ? 'disabled' : ''}
        >
          Cancel
        </button>
        <button
          type="button"
          data-action-save
          class="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
          ${isSaving ? 'disabled' : ''}
        >
          ${isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  `;
}
