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
    {
      name: 'no-router-to-legacy-role-helpers',
      comment: 'Routers must depend on role-policy or authorize, not legacy role helper shims',
      severity: 'error',
      from: { path: '^src/routers/' },
      to: { path: '^src/utils/(admin|rbac)\\.js$' },
    },
    {
      name: 'no-validation-to-legacy-email-helper',
      comment: 'Validation helpers must not depend on the legacy email helper shim',
      severity: 'error',
      from: { path: '^src/validation/' },
      to: { path: '^src/utils/rbac\\.js$' },
    },
    // === Frontend: block browser code from depending on server code ===
    {
      name: 'no-frontend-to-src',
      comment: 'Browser code must not depend on server modules',
      severity: 'error',
      from: { path: '(^|[\\/])public[\\/]js[\\/]' },
      to: { path: '(^|[\\/])src[\\/]' },
    },
    // === Frontend: cross-feature coupling is legacy debt, warn only ===
    {
      name: 'warn-cross-feature',
      comment: 'Cross-feature import — consider extracting shared logic to shared/',
      severity: 'warn',
      from: { path: '^public/js/(shared|features)/' },
      to: { path: '^public/js/(features|bootstrap)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.js$' },
    tsPreCompilationDeps: true,
  },
};
