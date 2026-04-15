import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default to 'node' environment for faster tests.
    // Tests needing jsdom must include: // @vitest-environment jsdom
    environment: 'node',
    globals: true,
    // Retry failed tests once to handle Windows file system flakiness
    retry: 1,
    // Use single fork to avoid race conditions on Windows
    singleFork: true,
    include: ['src/**/*.test.js', 'tests/unit/**/*.test.js'],
    exclude: ['tests/e2e/**', '.worktrees/**', 'node_modules/**', '.wrangler/**'],
    coverage: {
      all: false,
      provider: 'v8',
      include: [
        'public/js/bootstrap/**/*.js',
        'public/js/features/chat/**/*.js',
        'public/js/features/admin/**/*.js',
        'public/js/shared/api.js',
        'public/js/shared/store.js',
        'public/js/shared/realtime.js',
        'public/js/shared/shortcuts.js',
        'public/js/app-route-utils.js',
        'public/js/app-shells.js',
        'public/js/shared/utils/**/*.js',
        'public/js/shared/utils.js',
      ],
      exclude: [
        'src/**/*.test.js',
        'public/js/**/*.test.js',
        'public/js/features/chat/chat.js',
        'public/js/features/admin/admin.js',
        'public/js/shared/components/**/*.js',
        'public/js/bootstrap/auth.js',
        'node_modules',
        '.wrangler',
      ],
      reporter: ['text', 'html', 'json'],
    },
  },
});