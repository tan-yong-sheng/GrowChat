/** @type {import('dependency-cruiser').Configuration} */
module.exports = {
  forbidden: [
    // === Circular dependencies ===
    {
      name: 'no-circular',
      comment: 'Circular dependency detected — refactor to break the cycle',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    // === Backend: prevent upward imports ===
    {
      name: 'no-llm-to-chat',
      comment: 'LLM layer must not depend on chat layer',
      severity: 'error',
      from: { path: '^src/llm/' },
      to: { path: '^src/(chat|routers|services|repositories)/' },
    },
    {
      name: 'no-repo-to-services',
      comment: 'Repositories must not depend on services, chat, llm, or routers',
      severity: 'error',
      from: { path: '^src/repositories/' },
      to: { path: '^src/(routers|chat|llm|services)/' },
    },
    {
      name: 'no-leaf-to-router',
      comment: 'Leaf layers (utils, config, errors, etc) must not import routers',
      severity: 'error',
      from: {
        path: '^src/(llm|chat|services|repositories|shared|utils|config|errors|validation|mcp|middleware|durable)/',
      },
      to: { path: '^src/routers/' },
    },
    // === Frontend: prevent upward imports ===
    {
      name: 'no-fshared-to-ffeature',
      comment: 'Frontend shared must not import from features',
      severity: 'error',
      from: { path: '^public/js/shared/' },
      to: { path: '^public/js/(features|bootstrap)/' },
    },
    {
      name: 'no-ffeature-to-fbootstrap',
      comment: 'Frontend features must not import from bootstrap',
      severity: 'error',
      from: { path: '^public/js/features/' },
      to: { path: '^public/js/bootstrap/' },
    },
    // === Cross-feature coupling (warn, not error — some coupling is OK) ===
    {
      name: 'warn-cross-feature',
      comment: 'Cross-feature import — consider extracting shared logic to shared/',
      severity: 'warn',
      from: { path: '^public/js/features/([^/]+)/' },
      to: { path: '^public/js/features/(?!$1)([^/]+)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.js$' },
    tsPreCompilationDeps: true,
  },
};
