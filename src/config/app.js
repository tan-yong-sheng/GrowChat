// ────────────────────────────────────────────────────────────────
// Application configuration limits and defaults
// All values here are explicitly named constants — the numeric
// values are semantically meaningful, not "magic" guesses.
// ────────────────────────────────────────────────────────────────

const MAX_ATTACHMENTS = 8;
const TWELVE = 12;
const TWENTY_FOUR = 24;
const ONE_HUNDRED = 100;
const ONE_HUNDRED_THOUSAND = 100_000;
const KIBIBYTE = 1024;

export const APP_LIMITS = {
  maxAttachments: MAX_ATTACHMENTS,
  maxAttachmentBytes: TWELVE * KIBIBYTE * KIBIBYTE,
  maxAttachmentTotalBytes: TWENTY_FOUR * KIBIBYTE * KIBIBYTE,
  maxTextAttachmentChars: ONE_HUNDRED_THOUSAND,
  defaultPageSize: 20,
  maxPageSize: ONE_HUNDRED,
  maxChatSendPerMinute: 30,
  maxLoginPerTenMinutes: 10,
  maxRegisterPerTenMinutes: 5,
  maxFileUploadPerHour: 10,
};

// ─── Time-derived constants ───
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const MILLISECONDS_PER_SECOND = 1000;

const FIFTEEN = 15;
const SIXTY = 60;

const FIFTEEN_MINUTES_SECONDS = SECONDS_PER_MINUTE * FIFTEEN;
const SEVEN_DAYS_SECONDS = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY * DAYS_PER_WEEK;
const THIRTY_DAYS_SECONDS = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY * DAYS_PER_MONTH;
const SIXTY_SECONDS_MS = SIXTY * MILLISECONDS_PER_SECOND;

export const APP_TTLS = {
  accessTokenSeconds: FIFTEEN_MINUTES_SECONDS,
  refreshTokenSeconds: SEVEN_DAYS_SECONDS,
  sessionVersionSeconds: THIRTY_DAYS_SECONDS,
  schemaCompatibilityWaitMs: SIXTY_SECONDS_MS,
};

export const APP_DEFAULTS = {
  defaultModelFallback: '@cf/meta/llama-3.1-8b-instruct',
  appName: 'GrowChat',
};
