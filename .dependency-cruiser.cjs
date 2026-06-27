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
      from: { path: '(^|[\\\\/])public[\\\\/]js[\\\\/]' },
      to: { path: '(^|[\\\\/])src[\\\\/]' },
    },

    // === Frontend: cross-feature imports — error (same-feature subfolder imports are allowed) ===
    {
      name: 'no-cross-feature-chat',
      comment:
        'chat/ must not import from other features or bootstrap/ — extract shared logic to shared/',
      severity: 'error',
      from: { path: '^public/js/features/chat/' },
      to: {
        path: '^public/js/(features|bootstrap)/',
        pathNot: '^public/js/features/chat/',
      },
    },
    {
      name: 'no-cross-feature-admin',
      comment:
        'admin/ must not import from other features or bootstrap/ — extract shared logic to shared/',
      severity: 'error',
      from: { path: '^public/js/features/admin/' },
      to: {
        path: '^public/js/(features|bootstrap)/',
        pathNot: '^public/js/features/admin/',
      },
    },
    {
      name: 'no-cross-feature-account',
      comment:
        'account/ must not import from other features or bootstrap/ — extract shared logic to shared/',
      severity: 'error',
      from: { path: '^public/js/features/account/' },
      to: {
        path: '^public/js/(features|bootstrap)/',
        pathNot: [
          '^public/js/features/account/',
          '^public/js/features/admin/settings/connections-helpers\\.js$',
          '^public/js/features/admin/settings/connections-helpers-modal-models\\.js$',
          '^public/js/features/admin/settings/models-helpers\\.js$',
          '^public/js/features/admin/settings/acl-modal-shared\\.js$',
        ],
      },
    },
    {
      name: 'no-cross-feature-auth',
      comment:
        'auth/ must not import from other features or bootstrap/ — extract shared logic to shared/',
      severity: 'error',
      from: { path: '^public/js/features/auth/' },
      to: {
        path: '^public/js/(features|bootstrap)/',
        pathNot: '^public/js/features/auth/',
      },
    },
    {
      name: 'no-cross-feature-shared',
      comment: 'shared/ must not import from features/ or bootstrap/',
      severity: 'error',
      from: { path: '^public/js/shared/' },
      to: { path: '^public/js/(features|bootstrap)/' },
    },
    {
      name: 'no-cross-feature-landing',
      comment: 'Landing page must not import from features/ or bootstrap/',
      severity: 'error',
      from: { path: '^public/js/features/landing\\.js$' },
      to: { path: '^public/js/(features|bootstrap)/' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    includeOnly: ['src', 'public/js'],
    reporterOptions: {
      archi: {
        collapsePattern: '^node_modules',
      },
    },
  },
};
