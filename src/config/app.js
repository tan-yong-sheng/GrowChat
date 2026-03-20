export const APP_LIMITS = {
  maxAttachments: 8,
  maxAttachmentBytes: 12 * 1024 * 1024,
  maxAttachmentTotalBytes: 24 * 1024 * 1024,
  maxTextAttachmentChars: 100000,
  defaultPageSize: 20,
  maxPageSize: 100,
  maxChatSendPerMinute: 30,
  maxLoginPerTenMinutes: 10,
  maxRegisterPerTenMinutes: 5,
  maxFileUploadPerHour: 10,
};

export const APP_TTLS = {
  accessTokenSeconds: 60 * 15,
  refreshTokenSeconds: 60 * 60 * 24 * 7,
  schemaCompatibilityWaitMs: 60 * 1000,
};

export const APP_DEFAULTS = {
  defaultModelFallback: '@cf/meta/llama-3.1-8b-instruct',
  appName: 'GrowChat',
};
