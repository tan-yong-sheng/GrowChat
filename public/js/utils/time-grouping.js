function toTimestamp(chat) {
  const raw = chat?.updated_at ?? chat?.created_at;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function groupChatsByTime(chats = []) {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayTs = startOfToday.getTime();
  const yesterdayTs = todayTs - oneDayMs;
  const lastWeekTs = todayTs - (7 * oneDayMs);

  const groups = {
    today: [],
    yesterday: [],
    lastWeek: [],
    older: [],
  };

  for (const chat of chats) {
    const tsSeconds = toTimestamp(chat);
    const ts = tsSeconds > 1e12 ? tsSeconds : tsSeconds * 1000;
    if (!ts || ts > now + oneDayMs) {
      groups.older.push(chat);
      continue;
    }
    if (ts >= todayTs) groups.today.push(chat);
    else if (ts >= yesterdayTs) groups.yesterday.push(chat);
    else if (ts >= lastWeekTs) groups.lastWeek.push(chat);
    else groups.older.push(chat);
  }

  return groups;
}
