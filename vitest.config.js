import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js', 'node_modules', '.wrangler'],
      reporter: ['text', 'html', 'json'],
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
});
