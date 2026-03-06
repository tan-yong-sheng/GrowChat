export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function renderMessageContent(content) {
  if (!content) return '<span class="inline-block w-2 h-4 bg-gray-400 animate-pulse rounded-sm"></span>';
  if (window.marked) {
      return window.marked.parse(content);
  }
  return escapeHtml(content).replace(/\n/g, '<br/>');
}

export function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  const day = 24 * 60 * 60 * 1000;
  
  if (diff < day && now.getDate() === date.getDate()) {
    return 'Today';
  } else if (diff < 2 * day) {
    return 'Yesterday';
  } else if (diff < 7 * day) {
    return 'Previous 7 days';
  } else if (diff < 30 * day) {
    return 'Previous 30 days';
  } else {
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
}

export function formatTimestamp(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
