import { formatBytes, formatDate } from '../utils.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getFileStatus(file) {
  return file.extraction_status === 1 ? 'ready' : (file.extraction_status === -1 ? 'failed' : 'processing');
}

export function canDeleteFiles(currentState) {
  return currentState.permissions?.includes('file.delete') || false;
}

export function filterFilesByQuery(files = [], query = '') {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return Array.isArray(files) ? files : [];
  return (Array.isArray(files) ? files : []).filter((file) => {
    const name = String(file?.filename || '').toLowerCase();
    const type = String(file?.content_type || file?.type || '').toLowerCase();
    return name.includes(normalized) || type.includes(normalized);
  });
}

export function renderFilesEmptyStateMarkup() {
  return `
    <div class="flex flex-col items-center justify-center h-full py-12 text-center">
      <div class="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 text-gray-200">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <h3 class="text-sm font-semibold text-gray-800 mb-1">No files yet</h3>
      <p class="text-xs text-gray-400 max-w-[200px] mx-auto">Upload documents to use them in your conversations.</p>
    </div>
  `;
}

export function renderFilesListMarkup(files = [], currentState = {}) {
  return (Array.isArray(files) ? files : []).map((file) => {
    const isSelected = Array.isArray(currentState.files?.selectedIds) && currentState.files.selectedIds.includes(file.id);
    const status = getFileStatus(file);
    const statusColors = {
      ready: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      processing: 'bg-blue-100 text-blue-700 animate-pulse',
    };
    const canDelete = canDeleteFiles(currentState);

    return `
      <div class="group flex items-center gap-4 p-3 rounded-2xl border ${isSelected ? 'border-black bg-gray-50' : 'border-gray-100 hover:bg-gray-50'} transition-all cursor-pointer" data-file-id="${file.id}">
        <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="flex-grow min-w-0 flex flex-col">
          <div class="flex items-center gap-2">
            <span class="truncate font-medium text-gray-800 text-sm">${escapeHtml(file.filename)}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusColors[status]}">${status}</span>
          </div>
          <div class="flex items-center gap-2 text-[11px] text-gray-400">
            <span>${formatBytes(file.file_size)}</span>
            <span>&middot;</span>
            <span>${formatDate(file.created_at)}</span>
          </div>
        </div>
        <div class="flex-shrink-0 flex items-center gap-1">
          ${canDelete ? `
            <button class="delete-file-btn p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100" data-file-id="${file.id}" title="Delete file">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          ` : ''}
          <div class="w-6 h-6 rounded-full border-2 ${isSelected ? 'bg-black border-black' : 'border-gray-200'} flex items-center justify-center transition-colors">
            ${isSelected ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-white"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}


