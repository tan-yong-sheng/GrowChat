// @ts-check
const js = require('@eslint/js');
const globals = require('globals');
const boundariesPlugin = require('eslint-plugin-boundaries');

module.exports = [
  js.configs.recommended,

  // Boundary rules — phased strict rollout: frontend-first warn baseline
  // Element types are registered for future enforcement; dependency rules
  // are disabled until stricter layering is rolled out incrementally.
  {
    plugins: {
      boundaries: boundariesPlugin,
    },
    settings: {
      'boundaries/root-path': process.cwd(),
      'boundaries/dependency-nodes': ['import', 'require', 'export'],
      'boundaries/elements': [
        // Frontend (public/js/)
        { type: 'f-bootstrap', pattern: 'public/js/bootstrap/**' },
        { type: 'f-feature', pattern: 'public/js/features/**' },
        { type: 'f-shared', pattern: 'public/js/shared/**' },
        { type: 'f-utils', pattern: 'public/js/utils/**' },

        // Backend (src/)
        { type: 's-router', pattern: 'src/routers/**' },
        { type: 's-service', pattern: 'src/services/**' },
        { type: 's-shared', pattern: 'src/shared/**' },
        { type: 's-utils', pattern: 'src/utils/**' },
        { type: 's-feature', pattern: 'src/features/**' },
        { type: 's-admin', pattern: 'src/admin/**' },
        { type: 's-llm', pattern: 'src/llm/**' },
        { type: 's-chat', pattern: 'src/chat/**' },
        { type: 's-mcp', pattern: 'src/mcp/**' },
        { type: 's-middleware', pattern: 'src/middleware/**' },
        { type: 's-repository', pattern: 'src/repositories/**' },
        { type: 's-bootstrap', pattern: 'src/bootstrap/**' },
        { type: 's-config', pattern: 'src/config/**' },
        { type: 's-durable', pattern: 'src/durable/**' },
        { type: 's-errors', pattern: 'src/errors/**' },
        { type: 's-validation', pattern: 'src/validation/**' },
        { type: 's-root', pattern: 'src/*', mode: 'file' },

        { type: 'test', pattern: 'tests/**' },
        { type: 'scripts', pattern: 'scripts/**' },
      ],
    },
    rules: {
      'boundaries/no-unknown': 'off',
      'boundaries/no-unknown-files': 'off',
      'boundaries/dependencies': 'off',
    },
  },

  // Original project rules (applied to all files)
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-duplicate-imports': 'warn',
      complexity: ['warn', { max: 50 }],
      'max-lines-per-function': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-depth': ['warn', 7],
      'max-nested-callbacks': ['warn', 3],
    },
  },

  // Test files — relaxed limits for nesting, depth, and function length
  {
    files: ['tests/**/*.js', 'src/**/*.test.js'],
    rules: {
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
      'max-depth': 'off',
      complexity: 'off',
    },
  },

  // Large router and controller files — higher limits for legacy mega-functions.
  // TODO: Refactor these into sub-handlers and remove this override.
  {
    files: [
      'src/routers/admin.js',
      'src/routers/users.js',
      'src/routers/models.js',
      'src/routers/chat-message.js',
      'src/routers/chat-collection.js',
      'src/routers/auth.js',
      'src/routers/files.js',
      'src/routers/rbac.js',
      'src/routers/groups.js',
      'src/llm/stream-parser.js',
      'src/admin/tool-servers.js',
      'src/index.js',
      'public/js/features/chat/chat.js',
      'public/js/features/chat/chat-realtime-controller.js',
      'public/js/features/chat/chat-message-stream-send.js',
      'public/js/features/chat/message-input-controller.js',
      'public/js/features/chat/chat-message-stream-resume.js',
      'public/js/features/admin/settings/connections.js',
      'public/js/features/admin/settings/integrations.js',
      'public/js/features/admin/settings/policies.js',
      'public/js/features/admin/users/groups.js',
      'public/js/features/admin/users/overview.js',
      'public/js/features/account/account-connections.js',
      'public/js/features/account/account-integrations.js',
      'public/js/shared/components/connection-modal.js',
      'public/js/shared/markdown-renderer.js',
      'public/js/features/chat/chat-message-actions.js',
      'public/js/features/chat/chat-message-list-html.js',
      'public/js/features/chat/chat-message-retry-actions.js',
      'public/js/features/chat/chat-render-controller.js',
      'public/js/features/chat/chat-data-controller.js',
      'public/js/features/chat/model-selector-controller.js',
      'src/chat/assistant-runner.js',
      'src/llm/connections.js',
      'src/llm/provider-adapters.js',
      'public/js/features/admin/admin.js',
      'public/js/features/admin/settings/models.js',
    ],
    rules: {
      complexity: 'off',
      'max-lines-per-function': 'off',
    },
  },
];
