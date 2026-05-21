import { renderButton } from './button.js';

/**
 * Renders a status badge/pill
 * Used consistently across admin and account settings pages
 */
export function renderStatusBadge({
  text = '',
  tone = 'gray', // gray, green, amber, red, blue
} = {}) {
  const tones = {
    gray: 'border-gray-200 bg-gray-50 text-gray-500',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-600',
    blue: 'border-blue-100 bg-blue-50 text-blue-700',
  };

  return `
    <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[tone] || tones.gray}">
      ${text}
    </span>
  `;
}

/**
 * Renders a data table with consistent styling
 */
export function renderDataTable({
  columns = [], // [{ key, label, width }]
  rows = [], // [{ id, ...data }]
  actions = [], // [{ label, key, className }]
} = {}) {
  const headerHtml = columns
    .map(
      (col) =>
        `<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">${col.label}</th>`
    )
    .join('');

  const rowsHtml = rows
    .map((row) => {
      const cellsHtml = columns
        .map((col) => `<td class="px-4 py-3 text-sm text-gray-900">${row[col.key] || ''}</td>`)
        .join('');

      const actionsHtml = actions.length
        ? `<td class="px-4 py-3 text-right">
            <div class="flex items-center justify-end gap-2">
              ${actions
                .map(
                  (action) => `
                ${renderButton({ label: action.label, variant: 'secondary', className: `text-xs px-3 py-1.5 ${action.className || 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`, dataAttrs: { 'row-action': action.key, 'row-id': row.id } })}
              `
                )
                .join('')}
            </div>
          </td>`
        : '';

      return `
        <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition">
          ${cellsHtml}
          ${actionsHtml}
        </tr>
      `;
    })
    .join('');

  return `
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-gray-50 border-b border-gray-100">
          <tr>
            ${headerHtml}
            ${actions.length ? '<th class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Actions</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Renders a list item card with consistent styling
 */
export function renderListItemCard({
  title = '',
  subtitle = '',
  details = [], // [{ label, value }]
  badges = [], // [{ text, tone }]
  actions = [], // [{ label, key, className }]
} = {}) {
  return `
    <div class="py-3 px-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <div class="text-sm font-semibold text-gray-900 truncate">${title}</div>
            ${badges.map((badge) => renderStatusBadge(badge)).join('')}
          </div>
          ${subtitle ? `<div class="text-xs text-gray-500 mb-2">${subtitle}</div>` : ''}
          ${
            details.length
              ? `
            <div class="text-xs text-gray-500 space-y-1">
              ${details.map((d) => `<div>${d.label}: <span class="text-gray-700">${d.value}</span></div>`).join('')}
            </div>
          `
              : ''
          }
        </div>
        ${
          actions.length
            ? `
          <div class="flex items-center gap-2 flex-shrink-0">
            ${actions
              .map(
                (action) => `
              ${renderButton({ label: action.label, variant: 'secondary', className: `text-xs px-3 py-1.5 ${action.className || 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`, dataAttrs: { 'list-action': action.key } })}
            `
              )
              .join('')}
          </div>
        `
            : ''
        }
      </div>
    </div>
  `;
}

/**
 * Renders an empty state message
 */
export function renderEmptyState({
  title = 'No items',
  message = 'Get started by creating your first item.',
  icon = '📭',
} = {}) {
  return `
    <div class="py-12 text-center">
      <div class="text-4xl mb-3">${icon}</div>
      <div class="text-sm font-semibold text-gray-900 mb-1">${title}</div>
      <div class="text-xs text-gray-500">${message}</div>
    </div>
  `;
}
