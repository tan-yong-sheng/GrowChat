import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.js', 'tests/unit/**/*.test.js'],
    exclude: ['tests/e2e/**', '.worktrees/**', 'node_modules/**', '.wrangler/**'],
    coverage: {
      provider: 'v8',
      include: [
        'public/js/store.js',
        'public/js/app-route-utils.js',
        'public/js/app-shells.js',
        'public/js/chat-stream.js',
        'public/js/chat-list-actions.js',
        'public/js/chat-cache-controller.js',
        'public/js/chat-render-helpers.js',
        'public/js/utils/chat-cache.js',
        'public/js/utils/conversation.js',
        'public/js/utils/model-state.js',
        'public/js/utils/model-search.js',
        'public/js/utils/model-sync.js',
      ],
      exclude: ['src/**/*.test.js', 'public/js/**/*.test.js', 'node_modules', '.wrangler'],
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
