function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = Number(value);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  return new Date(value);
}

export function groupChatsByTime(chats) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  return {
    today: chats.filter((c) => toDate(c.updated_at) >= today),
    yesterday: chats.filter((c) => {
      const d = toDate(c.updated_at);
      return d >= yesterday && d < today;
    }),
    lastWeek: chats.filter((c) => {
      const d = toDate(c.updated_at);
      return d >= weekAgo && d < yesterday;
    }),
    older: chats.filter((c) => toDate(c.updated_at) < weekAgo),
  };
}

export function formatRelativeTime(isoDate) {
  const date = toDate(isoDate);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
