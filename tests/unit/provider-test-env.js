export const PROVIDER_TEST_ENV = {
  OPENAI_BASE_URL: 'https://api.example.com/v1',
  OPENAI_API_KEY: 'test-key-12345',
  GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
  GEMINI_API_KEY: 'gemini-key',
  ANTHROPIC_BASE_URL: 'https://api.anthropic.com/v1',
  ANTHROPIC_API_KEY: 'anthropic-key',
};

export function createProviderTestEnv(overrides = {}) {
  return {
    ...PROVIDER_TEST_ENV,
    ...overrides,
  };
}
