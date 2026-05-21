export function renderWorkspaceShell({
	sidebarHtml = "",
	mainHtml = "",
	shellClass = "flex h-[100dvh] w-full bg-white overflow-hidden font-primary text-gray-900",
} = {}) {
	return `
    <div class="${shellClass}">
      ${sidebarHtml}
      <main id="main" class="flex-1 flex flex-col min-w-0 overflow-y-auto">
        ${mainHtml}
      </main>
    </div>
  `;
}
