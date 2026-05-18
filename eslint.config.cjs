// @ts-check
const js = require('@eslint/js');
const globals = require('globals');
const boundariesPlugin = require('eslint-plugin-boundaries');

module.exports = [
  js.configs.recommended,
  // Boundary rules — phased strict rollout: frontend-first warn baseline
  {
    plugins: {
      boundaries: boundariesPlugin,
    },
    settings: {
      'boundaries/root-path': process.cwd(),
      // Only analyze static deps (skip dynamic import())
      'boundaries/dependency-nodes': ['import', 'require', 'export'],
      'boundaries/elements': [
        // Frontend (public/js/) — baseline coverage only
        { type: 'f-bootstrap', pattern: 'public/js/bootstrap/**' },
        { type: 'f-feature', pattern: 'public/js/features/**' },
        { type: 'f-shared', pattern: 'public/js/shared/**' },
        { type: 'f-utils', pattern: 'public/js/utils/**' },
        { type: 'test', pattern: 'tests/**' },
        { type: 'scripts', pattern: 'scripts/**' },
      ],
    },
    rules: {
      'boundaries/no-unknown': 'warn',
      'boundaries/no-unknown-files': 'warn',
      // Stricter frontend boundary model: default deny, explicit local allows only.
      'boundaries/dependencies': [
        'warn',
        {
          default: 'disallow',
          rules: [
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
              allow: { to: { type: 'f-shared' } },
            },
            {
              from: { type: 'f-utils' },
              allow: { to: { type: ['f-utils', 'f-shared'] } },
            },
            {
              from: { type: 'scripts' },
              allow: { to: { type: ['scripts'] } },
            },
            {
              from: { type: 'test' },
              allow: {
                to: {
                  type: ['f-bootstrap', 'f-feature', 'f-shared', 'f-utils', 'test', 'scripts'],
                },
              },
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

  // Test files — relaxed function length limit
  {
    files: ['tests/**/*.js'],
    rules: {
      'max-lines-per-function': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
];
