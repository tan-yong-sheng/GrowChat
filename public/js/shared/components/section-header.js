/**
 * Renders a section header with title, subtitle, and optional action button
 * Used consistently across admin and account settings pages
 */
export function renderSectionHeader({
  title = '',
  subtitle = '',
  label = '', // e.g., "LLM PROVIDERS"
  actionButton = null, // { label, key, className, attrs }
} = {}) {
  return `
    <div class="pt-0.5 pb-6 sticky top-0 z-10 bg-white">
      <div class="w-full flex items-center justify-between gap-3">
        <div>
          ${label ? `<div class="text-xs font-semibold uppercase tracking-wide text-gray-400">${label}</div>` : ''}
          <h1 class="text-xl font-medium text-gray-900">${title}</h1>
          ${subtitle ? `<div class="text-sm text-gray-500">${subtitle}</div>` : ''}
        </div>
        ${
          actionButton
            ? `
          <button
            type="button"
            ${actionButton.key ? `data-action="${actionButton.key}"` : ''}
            ${actionButton.attrs || ''}
            class="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 ${actionButton.className || ''}"
            title="${actionButton.label}"
            aria-label="${actionButton.label}"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        `
            : ''
        }
      </div>
    </div>
  `;
}

/**
 * Renders a subsection with label and description
 */
export function renderSubsection({ label = '', description = '', content = '' } = {}) {
  return `
    <section class="space-y-1">
      ${label ? `<div class="text-xs font-semibold uppercase tracking-wide text-gray-400">${label}</div>` : ''}
      ${description ? `<div class="text-sm text-gray-500">${description}</div>` : ''}
      <div class="mt-2">
        ${content}
      </div>
    </section>
  `;
}

/**
 * Renders a settings page layout with scrollable content area
 */
export function renderSettingsPageLayout({
  header = '',
  content = '',
  footer = '',
  className = '',
} = {}) {
  return `
    <div class="flex flex-col h-full min-h-0 animate-in fade-in duration-300 w-full ${className}">
      ${header ? `<div class="flex-shrink-0">${header}</div>` : ''}

      <div class="flex-1 min-h-0 overflow-y-auto scrollbar-hidden">
        <div class="w-full space-y-4 pb-6">
          ${content}
        </div>
      </div>

      ${footer ? `<div class="flex-shrink-0">${footer}</div>` : ''}
    </div>
  `;
}

/**
 * Renders an error message banner
 */
export function renderErrorBanner({ message = '', dismissible = true } = {}) {
  return `
    <div data-error-banner class="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center justify-between gap-3">
      <span>${message}</span>
      ${
        dismissible
          ? `
        <button
          type="button"
          data-dismiss-error
          class="text-red-400 hover:text-red-600 transition"
          aria-label="Dismiss"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      `
          : ''
      }
    </div>
  `;
}

/**
 * Renders a success message banner
 */
export function renderSuccessBanner({ message = '', dismissible = true } = {}) {
  return `
    <div data-success-banner class="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center justify-between gap-3">
      <span>${message}</span>
      ${
        dismissible
          ? `
        <button
          type="button"
          data-dismiss-success
          class="text-emerald-400 hover:text-emerald-600 transition"
          aria-label="Dismiss"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      `
          : ''
      }
    </div>
  `;
}
