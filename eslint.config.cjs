// @ts-check
const js = require('@eslint/js');
const globals = require('globals');
const boundariesPlugin = require('eslint-plugin-boundaries');
const tailwindcssPlugin = require('eslint-plugin-tailwindcss');

module.exports = [
  js.configs.recommended,
  // Boundary rules — permissive mode: only forbid known-bad directions
  {
    plugins: {
      boundaries: boundariesPlugin,
      tailwindcss: tailwindcssPlugin,
    },
    settings: {
      // Only analyze static deps (skip dynamic import())
      'boundaries/dependency-nodes': ['import', 'require', 'export'],
      'boundaries/elements': [
        // === Backend (src/) ===
        { type: 'router', pattern: 'src/routers/**/*' },
        { type: 'chat', pattern: 'src/chat/**/*' },
        { type: 'llm', pattern: 'src/llm/**/*' },
        { type: 'service', pattern: 'src/services/**/*' },
        { type: 'repository', pattern: 'src/repositories/**/*' },
        { type: 'shared', pattern: 'src/shared/**/*' },
        { type: 'util', pattern: 'src/utils/**/*' },
        { type: 'config', pattern: 'src/config/**/*' },
        { type: 'error', pattern: 'src/errors/**/*' },
        { type: 'validation', pattern: 'src/validation/**/*' },
        { type: 'mcp', pattern: 'src/mcp/**/*' },
        { type: 'middleware', pattern: 'src/middleware/**/*' },
        { type: 'durable', pattern: 'src/durable/**/*' },
        { type: 'admin', pattern: 'src/admin/**/*' },
        { type: 'feature', pattern: 'src/features/**/*' },
        { type: 'bootstrap', pattern: 'src/bootstrap/**/*' },
        // === Frontend (public/js/) ===
        { type: 'f-bootstrap', pattern: 'public/js/bootstrap/**/*' },
        { type: 'f-feature', pattern: 'public/js/features/**/*' },
        { type: 'f-shared', pattern: 'public/js/shared/**/*' },
      ],
    },
    rules: {
      'tailwindcss/classnames-order': 'warn',
      'tailwindcss/enforces-shorthand': 'warn',
      'tailwindcss/no-contradicting-classname': 'error',
      // Prevent upward imports — permissive: allow everything, disallow only known-bad
      'boundaries/dependencies': [
        2,
        {
          default: 'allow',
          message: '{{from.type}} cannot import {{to.type}} — violates architecture layers',
          rules: [
            // Backend: leaf layers must not import routers
            {
              from: {
                type: [
                  'llm',
                  'chat',
                  'service',
                  'repository',
                  'shared',
                  'util',
                  'config',
                  'error',
                  'validation',
                  'mcp',
                  'middleware',
                  'durable',
                ],
              },
              disallow: [{ to: { type: 'router' } }],
            },
            // Backend: repositories must not import routers, chat, llm, or services
            {
              from: { type: 'repository' },
              disallow: [{ to: { type: ['router', 'chat', 'llm', 'service'] } }],
            },
            // Backend: llm must not import chat, services, repositories, or routers
            {
              from: { type: 'llm' },
              disallow: [{ to: { type: ['chat', 'service', 'repository', 'router'] } }],
            },
            // Frontend: shared must not import features or bootstrap
            {
              from: { type: 'f-shared' },
              disallow: [{ to: { type: ['f-feature', 'f-bootstrap'] } }],
            },
            // Frontend: features must not import bootstrap
            {
              from: { type: 'f-feature' },
              disallow: [{ to: { type: 'f-bootstrap' } }],
            },
          ],
        },
      ],
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
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'no-duplicate-imports': 'warn',
      complexity: ['warn', { max: 15 }],
      'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }],
      'max-depth': ['warn', 4],
      'max-nested-callbacks': ['warn', 3],
    },
  },
];
