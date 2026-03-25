import { renderMessageContent } from '../shared/utils.js';

export function renderSharedChatPage(container, data) {
  const chat = data?.chat || {};
  const messages = data?.messages || [];
  container.innerHTML = `
    <div class="min-h-screen bg-[#fafafa] text-gray-900">
      <div class="max-w-3xl mx-auto px-4 py-6">
        <div class="flex items-center justify-between mb-6">
          <a href="/" class="text-sm text-gray-600 hover:text-gray-800">← GrowChat</a>
          <span class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">Shared Chat</span>
        </div>
        <h1 class="text-2xl font-semibold mb-1">${chat.title || 'Shared Chat'}</h1>
        <p class="text-sm text-gray-500 mb-6">Read-only view</p>
        <div class="space-y-5">
          ${messages.map((m) => `
            <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}">
              <div class="${m.role === 'user' ? 'bg-[#f0f0f0]' : 'bg-white border border-gray-200'} rounded-2xl px-4 py-3 max-w-[85%]">
                <p class="text-xs uppercase text-gray-400 mb-1">${m.role}</p>
                <div class="prose prose-sm max-w-none break-words">${renderMessageContent(m.content, { interactive: false })}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

export function renderAdminSkeleton(container) {
  container.innerHTML = `
    <div class="min-h-screen bg-[#fafafa] text-gray-900">
      <div class="max-w-6xl mx-auto px-4 py-6">
        <div class="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <div class="bg-white border border-gray-100 rounded-2xl p-4 animate-pulse">
            <div class="h-4 w-28 bg-gray-200 rounded mb-4"></div>
            <div class="space-y-3">
              <div class="h-3 w-32 bg-gray-200 rounded"></div>
              <div class="h-3 w-36 bg-gray-200 rounded"></div>
              <div class="h-3 w-24 bg-gray-200 rounded"></div>
            </div>
            <div class="mt-6 h-3 w-20 bg-gray-200 rounded"></div>
          </div>
          <div class="bg-white border border-gray-100 rounded-2xl p-6 animate-pulse">
            <div class="h-5 w-44 bg-gray-200 rounded mb-4"></div>
            <div class="space-y-3">
              <div class="h-3 w-full bg-gray-200 rounded"></div>
              <div class="h-3 w-11/12 bg-gray-200 rounded"></div>
              <div class="h-3 w-10/12 bg-gray-200 rounded"></div>
            </div>
            <div class="mt-6 h-3 w-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderChatSkeleton(container) {
  container.innerHTML = `
    <div class="h-full w-full bg-white overflow-hidden">
      <div class="flex h-full">
        <aside class="hidden md:flex w-[260px] flex-shrink-0 border-r border-gray-100 bg-[#f9f9f9] p-4">
          <div class="w-full space-y-4 animate-pulse">
            <div class="h-6 w-32 bg-gray-200 rounded"></div>
            <div class="h-10 w-full bg-gray-200 rounded-xl"></div>
            <div class="h-10 w-full bg-gray-200 rounded-xl"></div>
            <div class="mt-6 space-y-2">
              <div class="h-3 w-20 bg-gray-200 rounded"></div>
              <div class="h-8 w-full bg-gray-200 rounded-lg"></div>
              <div class="h-8 w-full bg-gray-200 rounded-lg"></div>
              <div class="h-8 w-full bg-gray-200 rounded-lg"></div>
            </div>
          </div>
        </aside>
        <main class="flex-1 flex flex-col min-w-0">
          <div class="h-[58px] border-b border-gray-100 bg-white/95 flex items-center px-4">
            <div class="h-6 w-40 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div class="flex-1 p-6">
            <div class="max-w-3xl space-y-4 animate-pulse">
              <div class="h-4 w-64 bg-gray-200 rounded"></div>
              <div class="h-24 w-full bg-gray-200 rounded-2xl"></div>
              <div class="h-24 w-11/12 bg-gray-200 rounded-2xl"></div>
              <div class="h-24 w-10/12 bg-gray-200 rounded-2xl"></div>
            </div>
          </div>
        </main>
      </div>
    </div>
  `;
}
