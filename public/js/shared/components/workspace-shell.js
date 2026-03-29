export function renderWorkspaceShell({
  sidebarHtml = '',
  mainHtml = '',
  shellClass = 'flex h-[100dvh] w-full bg-white overflow-hidden font-primary text-gray-900',
} = {}) {
  return `
    <div class="${shellClass}">
      ${sidebarHtml}
      <div class="flex-1 flex flex-col min-w-0">
        ${mainHtml}
      </div>
    </div>
  `;
}
