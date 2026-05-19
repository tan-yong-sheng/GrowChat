import { fetchAdminUsage } from '../../../shared/api.js';
import { escapeHtml } from '../../../shared/utils.js';

/**
 * Trend arrow indicator: compares current vs previous value.
 * Returns ↑ (up), ↓ (down), or → (flat) with color class.
 */
function trendIndicator(current, previous) {
  if (!previous || previous === 0) {
    if (current > 0) return { arrow: '↑', color: 'text-emerald-600', label: 'new' };
    return { arrow: '→', color: 'text-gray-400', label: 'no data' };
  }
  const ratio = (current - previous) / previous;
  if (ratio > 0.05) return { arrow: '↑', color: 'text-emerald-600', label: `+${Math.round(ratio * 100)}%` };
  if (ratio < -0.05) return { arrow: '↓', color: 'text-red-500', label: `${Math.round(ratio * 100)}%` };
  return { arrow: '→', color: 'text-gray-400', label: 'flat' };
}


function formatNumber(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString();
}

/**
 * Render a single metric card.
 */
function renderMetricCard({ label, value, trend, icon }) {
  const trendHtml = trend
    ? `<span class="${trend.color} text-xs font-medium ml-1.5">${trend.arrow} ${trend.label}</span>`
    : '';
  return `
    <div class="rounded-2xl border border-gray-100 bg-white p-5 flex flex-col gap-1.5 min-w-0">
      <div class="flex items-center gap-2 text-gray-500 text-sm font-medium">
        <span class="text-gray-400">${icon}</span>
        <span>${escapeHtml(label)}</span>
      </div>
      <div class="flex items-baseline gap-1">
        <span class="text-2xl font-semibold text-gray-900 tracking-tight">${formatNumber(value)}</span>
        ${trendHtml}
      </div>
    </div>`;
}

/**
 * Render the daily messages breakdown table.
 */
function renderDailyTable(daily = []) {
  if (!daily.length) return '<p class="text-sm text-gray-400 py-4 text-center">No message data for the last 7 days.</p>';
  const rows = daily
    .map(
      (row) => `
      <tr class="border-b border-gray-50 last:border-0">
        <td class="py-2.5 px-3 text-sm text-gray-700 font-medium">${escapeHtml(row.day)}</td>
        <td class="py-2.5 px-3 text-sm text-gray-900 text-right font-mono tabular-nums">${formatNumber(row.count)}</td>
      </tr>`
    )
    .join('');
  return `
    <table class="w-full text-left">
      <thead class="text-[11px] text-gray-500 font-bold uppercase bg-gray-50/50">
        <tr class="border-b border-gray-100">
          <th class="py-2 px-3">Day</th>
          <th class="py-2 px-3 text-right">Messages</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * Render the weekly messages breakdown table.
 */
function renderWeeklyTable(weekly = []) {
  if (!weekly.length) return '<p class="text-sm text-gray-400 py-4 text-center">No weekly message data available.</p>';
  const rows = weekly
    .map(
      (row) => `
      <tr class="border-b border-gray-50 last:border-0">
        <td class="py-2.5 px-3 text-sm text-gray-700 font-medium">${escapeHtml(row.week)}</td>
        <td class="py-2.5 px-3 text-sm text-gray-900 text-right font-mono tabular-nums">${formatNumber(row.count)}</td>
      </tr>`
    )
    .join('');
  return `
    <table class="w-full text-left">
      <thead class="text-[11px] text-gray-500 font-bold uppercase bg-gray-50/50">
        <tr class="border-b border-gray-100">
          <th class="py-2 px-3">Week</th>
          <th class="py-2 px-3 text-right">Messages</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * Fetch usage data and render the admin overview dashboard.
 */
export async function renderUsageOverview(container) {
  container.innerHTML = `
    <div class="flex flex-col min-h-0 animate-in fade-in duration-150 w-full">
      <div class="pt-0.5 pb-2.5 flex justify-between items-center bg-white">
        <div class="flex items-center text-xl font-medium px-0.5 gap-2">
          <div class="flex-shrink-0 text-gray-900">Overview</div>
        </div>
      </div>
      <div id="usage-metrics-loading" class="flex items-center justify-center h-32">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
      </div>
    </div>`;

  let data;
  try {
    data = await fetchAdminUsage();
  } catch (err) {
    container.innerHTML = `
      <div class="flex flex-col min-h-0 animate-in fade-in duration-150 w-full">
        <div class="pt-0.5 pb-2.5 flex justify-between items-center bg-white">
          <div class="flex items-center text-xl font-medium px-0.5 gap-2">
            <div class="flex-shrink-0 text-gray-900">Overview</div>
          </div>
        </div>
        <div class="flex items-center justify-center h-32">
          <div class="rounded-2xl border border-red-100 bg-red-50/60 px-6 py-4 text-center">
            <p class="text-sm font-semibold text-red-700">Failed to load usage metrics</p>
            <p class="text-sm text-red-600 mt-1">${escapeHtml(err.message)}</p>
          </div>
        </div>
      </div>`;
    return;
  }

  const { users = {}, messages = {}, sparks = {} } = data;

  // Compute trends
  const active7dTrend = trendIndicator(users.active_7d, users.prev_active_7d);
  const active30dTrend = trendIndicator(users.active_30d, users.prev_active_30d);
  const dailyTrend = trendIndicator(messages.daily_total, messages.prev_daily_total);
  const weeklyTrend = trendIndicator(messages.weekly_total, messages.prev_weekly_total);
  const sparksTrend = trendIndicator(sparks.last_30d, sparks.prev_30d);

  const usersIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 12.25A4.75 4.75 0 0 1 7.25 7.5h1.5a4.75 4.75 0 0 1 4.75 4.75.75.75 0 0 1-.75.75H3.25a.75.75 0 0 1-.75-.75Z"/></svg>`;
  const active7dIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M8 15a7 7 0 1 0 0-14A7 7 0 0 0 8 15Zm.75-10.25a.75.75 0 0 0-1.5 0v3.5c0 .199.079.39.22.53l2 2a.75.75 0 1 0 1.06-1.06L8.75 7.94V4.75Z" clip-rule="evenodd"/></svg>`;
  const active30dIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M4 1.75a.75.75 0 0 1 .75.75V4h6.5V2.5a.75.75 0 0 1 1.5 0v10a.75.75 0 0 1-1.5 0V11h-6.5v1.5a.75.75 0 0 1-1.5 0v-10A.75.75 0 0 1 4 1.75ZM4.75 5.5v4h6.5v-4h-6.5Z" clip-rule="evenodd"/></svg>`;
  const messagesIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v5.997a1.5 1.5 0 0 1-1.5 1.5H7.501l-2.978 2.24a.75.75 0 0 1-1.193-.607v-1.633H3.5A1.5 1.5 0 0 1 2 9.497V3.5ZM3.5 3a.5.5 0 0 0-.5.5v5.997a.5.5 0 0 0 .5.5h1.326a.75.75 0 0 1 .75.75v1.078l2.152-1.62a.75.75 0 0 1 .449-.15H12.5a.5.5 0 0 0 .5-.5V3.5a.5.5 0 0 0-.5-.5h-9Z" clip-rule="evenodd"/></svg>`;
  const sparksIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path d="M7.5 1a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 7.5 1ZM4.736 2.394a.75.75 0 0 1 .07 1.057l-1.25 1.428a.75.75 0 0 1-1.128-.988l1.25-1.428a.75.75 0 0 1 1.058-.07Zm5.528 0a.75.75 0 0 1 1.058.07l1.25 1.428a.75.75 0 1 1-1.128.988l-1.25-1.428a.75.75 0 0 1 .07-1.058ZM3.75 7.5a.75.75 0 0 1 .75.75v.75a4 4 0 0 0 8 0v-.75a.75.75 0 0 1 1.5 0v.75a5.5 5.5 0 0 1-11 0v-.75a.75.75 0 0 1 .75-.75ZM8 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" /></svg>`;

  container.innerHTML = `
    <div class="flex flex-col min-h-0 animate-in fade-in duration-150 w-full">
      <div class="pt-0.5 pb-2.5 flex justify-between items-center bg-white">
        <div class="flex items-center text-xl font-medium px-0.5 gap-2">
          <div class="flex-shrink-0 text-gray-900">Overview</div>
        </div>
      </div>
      <div class="flex-1 min-h-0 space-y-6 pb-6">
        <!-- Metric Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          ${renderMetricCard({ label: 'Total Users', value: users.total, icon: usersIcon })}
          ${renderMetricCard({ label: 'Active 7d', value: users.active_7d, trend: active7dTrend, icon: active7dIcon })}
          ${renderMetricCard({ label: 'Active 30d', value: users.active_30d, trend: active30dTrend, icon: active30dIcon })}
          ${renderMetricCard({ label: 'Messages (7d)', value: messages.daily_total, trend: dailyTrend, icon: messagesIcon })}
          ${renderMetricCard({ label: 'Sparks (30d)', value: sparks.last_30d, trend: sparksTrend, icon: sparksIcon })}
        </div>

        <!-- Data Tables -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Daily Breakdown -->
          <div class="rounded-2xl border border-gray-100 bg-white p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-gray-900">Daily Messages (Last 7 Days)</h3>
              ${dailyTrend ? `<span class="${dailyTrend.color} text-xs font-medium">${dailyTrend.arrow} ${dailyTrend.label} vs prev 7d</span>` : ''}
            </div>
            <div class="overflow-auto">
              ${renderDailyTable(messages.daily)}
            </div>
          </div>

          <!-- Weekly Breakdown -->
          <div class="rounded-2xl border border-gray-100 bg-white p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-gray-900">Weekly Messages (Last 4 Weeks)</h3>
              ${weeklyTrend ? `<span class="${weeklyTrend.color} text-xs font-medium">${weeklyTrend.arrow} ${weeklyTrend.label} vs prev 4w</span>` : ''}
            </div>
            <div class="overflow-auto">
              ${renderWeeklyTable(messages.weekly)}
            </div>
          </div>
        </div>

        <!-- Sparks Detail -->
        <div class="rounded-2xl border border-gray-100 bg-white p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-gray-900">LLM API Calls (Sparks)</h3>
            ${sparksTrend ? `<span class="${sparksTrend.color} text-xs font-medium">${sparksTrend.arrow} ${sparksTrend.label} vs prev 30d</span>` : ''}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="flex flex-col gap-1 px-3 py-2.5 rounded-xl bg-gray-50/60">
              <span class="text-xs text-gray-500 font-medium">Total (All Time)</span>
              <span class="text-lg font-semibold text-gray-900 tabular-nums">${formatNumber(sparks.total)}</span>
            </div>
            <div class="flex flex-col gap-1 px-3 py-2.5 rounded-xl bg-gray-50/60">
              <span class="text-xs text-gray-500 font-medium">Last 30 Days</span>
              <span class="text-lg font-semibold text-gray-900 tabular-nums">${formatNumber(sparks.last_30d)}</span>
            </div>
            <div class="flex flex-col gap-1 px-3 py-2.5 rounded-xl bg-gray-50/60">
              <span class="text-xs text-gray-500 font-medium">Previous 30 Days</span>
              <span class="text-lg font-semibold text-gray-900 tabular-nums">${formatNumber(sparks.prev_30d)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}
