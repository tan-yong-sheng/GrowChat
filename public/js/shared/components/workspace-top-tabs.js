import { escapeHtml } from '../utils/dom-escape.js';
export function renderWorkspaceTopTabs({
  tabs = [],
  activeKey = '',
  dataAttrName = 'data-nav',
} = {}) {
  return `
    <div class="flex w-full">
      <div class="flex gap-1 scrollbar-none overflow-x-auto w-fit text-center text-sm font-medium pt-1">
        ${tabs
          .map((tab) => {
            const active = tab.key === activeKey;
            return `<a href="${escapeHtml(tab.href)}" ${dataAttrName}="${escapeHtml(tab.key)}" class="min-w-fit p-1.5 transition select-none ${active ? 'text-gray-900 underline underline-offset-[10px] decoration-2' : 'text-gray-600 hover:text-gray-900'}">${escapeHtml(tab.label)}</a>`;
          })
          .join('')}
      </div>
    </div>
  `;
}
