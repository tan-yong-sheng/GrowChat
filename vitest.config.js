import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.js'],
    exclude: ['tests/**', '.worktrees/**', 'node_modules/**', '.wrangler/**'],
    coverage: {
      provider: 'v8',
      include: [
        'src/auth.js',
        'src/db.js',
        'src/llm.js',
        'src/session.js',
        'src/utils/response.js',
      ],
      exclude: ['src/**/*.test.js', 'node_modules', '.wrangler'],
      reporter: ['text', 'html', 'json'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
