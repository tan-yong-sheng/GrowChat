function shiftDate(date, offsetDays) {
  const result = new Date(date);
  result.setDate(result.getDate() + offsetDays);
  return result;
}

function toDateString(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toDateString();
}

export function buildMetadataSystemPrompt({
  appName = 'GrowChat',
  model = '',
  providerFamily = '',
  now = new Date(),
  timeZone,
  platform,
} = {}) {
  const current = now instanceof Date ? now : new Date(now);
  const safeAppName = String(appName || 'GrowChat').trim() || 'GrowChat';
  const safeModel = String(model || '').trim() || 'unknown';
  const safeProviderFamily = String(providerFamily || '').trim() || 'unknown';
  const resolvedTimeZone =
    String(timeZone || (typeof Intl !== 'undefined' && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : '') || '')
      .trim() || 'UTC';
  const runtimePlatform =
    String(platform || (typeof process !== 'undefined' && process?.platform ? process.platform : '') || '').trim() ||
    'unknown';

  return [
    `You are powered by the model named ${safeModel}.`,
    `Here is some useful information about the environment you are running in:`,
    `<env>`,
    `  Application: ${safeAppName}`,
    `  Provider family: ${safeProviderFamily}`,
    `  Platform: ${runtimePlatform}`,
    `  Timezone: ${resolvedTimeZone}`,
    `  Current timestamp: ${current.toISOString()}`,
    `  Today's date: ${toDateString(current)}`,
    `  Yesterday's date: ${toDateString(shiftDate(current, -1))}`,
    `  Tomorrow's date: ${toDateString(shiftDate(current, 1))}`,
    `</env>`,
  ].join('\n');
}
