import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default to 'node' environment for faster tests.
    // Tests needing jsdom must include:
    // @vitest-environment jsdom
    environment: 'node',
    globals: true,
    // Retry failed tests once to handle Windows file system flakiness
    retry: 1,
    pool: 'threads',
    fileParallelism: true,
    // Cap concurrent workers to avoid overwhelming jsdom env startup
    // on high-core machines. CI typically 4-8 cores; I/O bandwidth is the bottleneck.
    maxWorkers: process.env.CI ? 4 : 6,
    testTimeout: 10000,
    include: ['src/**/*.test.js', 'tests/unit/**/*.test.js'],
    exclude: ['tests/e2e/**', '.worktrees/**', 'node_modules/**', '.wrangler/**'],
    coverage: {
      all: true,
      provider: 'v8',
      // Tier 2: Intentionally lowered to accommodate src/ backend coverage.
      // #95: Initial 30% threshold for combined frontend + src/ coverage.
      // Tier 4 (#102): Raise incrementally to 80% as coverage improves.
      thresholds: {
        lines: 30,
        branches: 30,
        functions: 30,
        statements: 30,
      },
      include: [
        'src/**/*.js',
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
