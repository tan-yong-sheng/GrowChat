/**
 * Sticky header HTML template for the policies settings view.
 *
 * Renders the group filter, family selector, search input,
 * and visibility dropdown.
 */

import { getVisibilityFilterBadge } from './policies-acl-helpers.js';
import { escapeHtml, resourceBadge } from './policies-rendering.js';

/**
 * Build the sticky header HTML string.
 *
 * @param {object} ctx
 * @param {string} ctx.groupOptions   – Pre-built <option> HTML
 * @param {string} ctx.familyOptions  – Pre-built <option> HTML
 * @param {string} ctx.query          – Current search query
 * @param {object} ctx.visibilityFilters
 * @param {boolean} ctx.filtersOpen
 * @param {number} ctx.activeVisibilityCount
 */
export function buildStickyHeaderHtml(ctx) {
  const {
    groupOptions,
    familyOptions,
    query,
    visibilityFilters,
    filtersOpen,
    activeVisibilityCount,
  } = ctx;

  return `
  <div class="shrink-0 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 relative z-10 isolate">
    <div class="max-w-6xl mx-auto w-full space-y-1 py-1.5">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center text-xl font-medium px-0.5 gap-2">
          <div class="flex-shrink-0 text-gray-900">Access Policies</div>
        </div>
      </div>
      ${
        window.location.pathname.startsWith('/admin/users/policies')
          ? `
      <div class="px-0.5 text-[11px] text-gray-500 leading-tight">
        Slim policy review view. Disabled resources stay hidden by default.
      </div>
      `
          : ''
      }
      <div class="flex flex-nowrap items-end gap-2 overflow-visible">
        <label class="min-w-0 flex-[0.95] space-y-1">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Group</span>
          <select id="policy-group-filter"
            class="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-400">
            ${groupOptions}
          </select>
        </label>
        <label class="min-w-[10rem] flex-[0.8] space-y-1">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Resources</span>
          <select id="policy-family-select"
            class="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-400">
            ${familyOptions}
          </select>
        </label>
        <label class="min-w-0 flex-[1.5] space-y-1">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Search</span>
          <input id="policy-search" value="${escapeHtml(query)}"
            class="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-400"
            placeholder="Search resources">
        </label>
        <div class="relative shrink-0 z-50">
          <button type="button" id="policy-visibility-toggle"
            class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 outline-none focus:border-gray-400 hover:bg-gray-50"
            aria-label="Visibility" title="Visibility">
            <span class="flex items-center gap-1">
              ${
                activeVisibilityCount
                  ? '<span class="rounded-full bg-gray-900 px-1.5 py-0.5 text-[10px] text-white">' +
                    String(activeVisibilityCount) +
                    '</span>'
                  : ''
              }
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5 text-gray-400">
                <path fill-rule="evenodd" d="M3.5 5.25a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 0 1.5H4.25a.75.75 0 0 1-.75-.75Zm0 4.75a.75.75 0 0 1 .75-.75h8a.75.75 0 0 1 0 1.5h-8a.75.75 0 0 1-.75-.75Zm0 4.75a.75.75 0 0 1 .75-.75h5a.75.75 0 0 0 0 1.5h-5a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd" />
              </svg>
            </span>
          </button>
          <div data-policy-visibility-menu class="${filtersOpen ? '' : 'hidden'} absolute right-0 top-full z-[120] mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Visibility</div>
            <div class="mt-1 text-[11px] text-gray-500">Applies to the selected group.</div>
            ${buildVisibilityCheckbox('allowed', 'Allowed', 'Show allowlisted resources.', visibilityFilters)}
            ${buildVisibilityCheckbox('inaccessible', 'No access', 'Show resources with no matching ACL rule.', visibilityFilters)}
            ${buildVisibilityCheckbox('denied', 'Denied', 'Show explicit deny rules.', visibilityFilters)}
            ${
              window.location.pathname.startsWith('/admin/users/policies')
                ? ''
                : buildVisibilityCheckbox(
                    'disabled',
                    'Disabled',
                    'Show disabled resources.',
                    visibilityFilters
                  )
            }
          </div>
        </div>
      </div>
    </div>
  </div>
  `;
}

function buildVisibilityCheckbox(key, label, description, visibilityFilters) {
  const badge = getVisibilityFilterBadge(label, visibilityFilters[key]);
  return `
  <label class="mt-3 flex items-start gap-2 text-sm text-gray-700">
    <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300"
      data-policy-filter="${key}" ${visibilityFilters[key] ? 'checked' : ''}>
    <span>
      <span class="block">${resourceBadge(badge.label, badge.kind, true)}</span>
      <span class="block text-[11px] text-gray-500">${description}</span>
    </span>
  </label>
  `;
}
