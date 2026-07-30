// @ts-check
const js = require('@eslint/js');
const globals = require('globals');
const boundariesPlugin = require('eslint-plugin-boundaries');
const growchatLoggingPlugin = require('./eslint-rules/index.cjs');

const srcTypes = [
  's-router',
  's-service',
  's-shared',
  's-utils',
  's-feature',
  's-admin',
  's-llm',
  's-chat',
  's-mcp',
  's-middleware',
  's-repository',
  's-bootstrap',
  's-config',
  's-durable',
  's-errors',
  's-validation',
  's-root',
];

module.exports = [
  js.configs.recommended,

  // Boundary rules — phased strict rollout: frontend-first warn baseline.
  // Frontend dependency rules are enforced; backend elements are registered
  // with permissive allow-all rules until stricter layering is rolled out.
  {
    plugins: {
      boundaries: boundariesPlugin,
      'growchat-logging': growchatLoggingPlugin,
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
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          rules: [
            // Frontend guardrails (preserved from original config)
            {
              from: { type: 'f-bootstrap' },
              allow: { to: { type: ['f-bootstrap', 'f-shared'] } },
            },
            {
              from: { type: 'f-feature' },
              allow: { to: { type: ['f-feature', 'f-shared'] } },
            },
            {
              from: { type: 'f-shared' },
              allow: { to: { type: ['f-shared'] } },
            },
            {
              from: { type: 'f-utils' },
              allow: { to: { type: ['f-utils', 'f-shared'] } },
            },
            {
              from: { type: 'scripts' },
              allow: { to: { type: ['scripts', 's-bootstrap'] } },
            },
            {
              from: { type: 'test' },
              allow: {
                to: {
                  type: ['f-bootstrap', 'f-feature', 'f-shared', 'f-utils', 'test', 'scripts'],
                },
              },
            },
            // Backend layer isolation — matches dep-cruiser rules from .dependency-cruiser.cjs
            // Layer hierarchy (top → bottom):
            // s-router → s-service → s-chat → s-llm → s-repository → leaf layers
            // Leaf layers (s-utils, s-config, s-errors, s-validation, s-shared, s-middleware,
            // s-mcp, s-durable, s-feature, s-admin, s-bootstrap) must not import s-router.
            // Routers must not import legacy role helpers (s-utils admin/rbac).
            {
              from: { type: 's-router' },
              allow: {
                to: {
                  type: [
                    's-root',
                    's-service',
                    's-chat',
                    's-llm',
                    's-repository',
                    's-shared',
                    's-utils',
                    's-config',
                    's-errors',
                    's-validation',
                    's-middleware',
                    's-mcp',
                    's-durable',
                    's-feature',
                    's-admin',
                    's-bootstrap',
                    'f-shared',
                  ],
                },
              },
            },
            {
              from: { type: 's-service' },
              allow: {
                to: {
                  type: [
                    's-root',
                    's-llm',
                    's-repository',
                    's-shared',
                    's-utils',
                    's-config',
                    's-errors',
                    's-validation',
                    's-middleware',
                    's-mcp',
                    's-durable',
                    's-feature',
                    's-admin',
                    's-bootstrap',
                    'f-shared',
                  ],
                },
              },
            },
            {
              from: { type: 's-chat' },
              allow: {
                to: {
                  type: [
                    's-service',
                    's-repository',
                    's-shared',
                    's-utils',
                    's-config',
                    's-errors',
                    's-validation',
                    's-middleware',
                    's-mcp',
                    's-durable',
                    's-feature',
                    's-admin',
                    's-bootstrap',
                    'f-shared',
                  ],
                },
              },
            },
            {
              from: { type: 's-llm' },
              allow: {
                to: {
                  type: [
                    's-root',
                    's-shared',
                    's-utils',
                    's-config',
                    's-errors',
                    's-validation',
                    's-middleware',
                    's-mcp',
                    's-durable',
                    's-feature',
                    's-admin',
                    's-bootstrap',
                    'f-shared',
                  ],
                },
              },
            },
            {
              from: { type: 's-repository' },
              allow: {
                to: {
                  type: [
                    's-root',
                    's-shared',
                    's-utils',
                    's-config',
                    's-errors',
                    's-validation',
                    's-middleware',
                    's-mcp',
                    's-durable',
                    's-feature',
                    's-admin',
                    's-bootstrap',
                    'f-shared',
                  ],
                },
              },
            },
            // Bootstrap layer: wires up routers (intentional upward dependency for registration)
            {
              from: { type: 's-bootstrap' },
              allow: {
                to: {
                  type: [
                    's-router',
                    's-service',
                    's-chat',
                    's-llm',
                    's-repository',
                    's-shared',
                    's-utils',
                    's-config',
                    's-errors',
                    's-validation',
                    's-middleware',
                    's-mcp',
                    's-durable',
                    's-feature',
                    's-admin',
                    's-root',
                    'f-shared',
                  ],
                },
              },
            },
            // Leaf layers: may import from each other and f-shared, but NOT from s-router
            {
              from: {
                type: [
                  's-shared',
                  's-utils',
                  's-config',
                  's-errors',
                  's-validation',
                  's-middleware',
                  's-mcp',
                  's-durable',
                  's-feature',
                  's-admin',
                  's-bootstrap',
                ],
              },
              allow: {
                to: {
                  type: [
                    's-root',
                    's-shared',
                    's-utils',
                    's-config',
                    's-errors',
                    's-validation',
                    's-middleware',
                    's-mcp',
                    's-durable',
                    's-feature',
                    's-admin',
                    's-bootstrap',
                    'f-shared',
                  ],
                },
              },
            },
            // s-root files (entry points) may import from any src layer
            {
              from: { type: 's-root' },
              allow: { to: { type: [...srcTypes, 'f-shared'] } },
            },
            // Tests may import from any src or frontend element type
            {
              from: { type: 'test' },
              allow: { to: { type: [...srcTypes, 'f-feature', 'f-shared'] } },
            },
            // src root-level files may import from test helpers
            {
              from: { type: 's-root' },
              allow: { to: { type: ['test'] } },
            },
            // src feature test files may import from frontend feature code
            {
              from: { type: 's-feature' },
              allow: { to: { type: ['f-feature'] } },
            },
            // src router test files may import from test helpers
            {
              from: { type: 's-router' },
              allow: { to: { type: ['test'] } },
            },
          ],
        },
      ],
    },
  },

  // Original project rules — strict defaults for new code
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
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
      'growchat-logging/no-console-logging': 'error',
      'no-duplicate-imports': 'error',
      complexity: ['error', { max: 10 }],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 4],
      'max-nested-callbacks': ['error', 3],
      // #108 / #109 — Guardrail rules (promoted to error)
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-magic-numbers': [
        'error',
        {
          ignore: [0, 1, -1, 2, 16, 64, 100, 200, 256, 400, 500, 600, 1000, 1024, 15000, 3600],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
        },
      ],

      'max-classes-per-file': ['error', { max: 1 }],
      'max-params': ['error', { max: 4 }],
      'max-statements': ['error', { max: 20 }],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  // Frontend JS files — max 400 lines per file
  {
    files: ['public/js/**/*.js'],
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },

  // Test files — relaxed limits for nesting, depth, and function length
  {
    files: ['tests/**/*.js', 'src/**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
    rules: {
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
      'max-depth': 'off',
      complexity: 'off',
      'no-unused-vars': 'off',
      'no-magic-numbers': 'off',
      'max-params': 'off',
      'max-statements': 'off',
      'max-lines': 'off',
      'max-classes-per-file': 'off',
    },
  },
];
