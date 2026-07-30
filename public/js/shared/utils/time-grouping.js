const MS_TIMESTAMP_THRESHOLD = 1e12;
const DAYS_WEEK = 7;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    return new Date(value < MS_TIMESTAMP_THRESHOLD ? value * 1000 : value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = Number(value);
    return new Date(n < MS_TIMESTAMP_THRESHOLD ? n * 1000 : n);
  }
  return new Date(value);
}

export function groupChatsByTime(chats) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - DAYS_WEEK);

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
  const diffMins = Math.floor(diffMs / (1000 * MINUTES_PER_HOUR));
  const diffHours = Math.floor(diffMs / (1000 * MINUTES_PER_HOUR * MINUTES_PER_HOUR));
  const diffDays = Math.floor(
    diffMs / (1000 * MINUTES_PER_HOUR * MINUTES_PER_HOUR * HOURS_PER_DAY)
  );

  if (diffMins < MINUTES_PER_HOUR) return `${diffMins}m ago`;
  if (diffHours < HOURS_PER_DAY) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < DAYS_WEEK) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
