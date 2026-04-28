# Short-Term Worktree Feature Summary

This worktree `.worktrees/short-term` adds several durable product slices plus support wiring. Ranked by importance:

| Rank | Feature                                      |  Importance | What it adds                                                                                            | Key files                                                                                                                                                                                  |
| ---- | -------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Email verification / onboarding gate         |    Critical | New user email verification flow, resend verification, pending/success UI, token handling, DB migration | `src/routers/email-verification.js`, `public/js/features/auth/verification-pending.js`, `public/js/features/auth/verification-success.js`, `migrations/004_email_verification.sql`, tests  |
| 2    | Auth/session management                      |        High | Session list/revoke for user account shell, auth bootstrap wiring, session KV behavior                  | `src/routers/session-management.js`, `public/js/features/account/sessions.js`, `public/js/features/account/account.js`, `public/js/bootstrap/app.js`, `tests/unit/public-sessions.test.js` |
| 3    | Message editing                              |        High | User can edit own chat messages, backend edit route, client edit UI                                     | `src/routers/message-edit.js`, `public/js/features/chat/chat-message-edit.js`, `migrations/005_message_editing.sql`, tests                                                                 |
| 4    | Audit logs / admin observability             | Medium-High | Admin audit log UI + server log storage/query + admin page wiring                                       | `src/services/audit-log.js`, `public/js/features/admin/audit-logs.js`, `src/routers/admin.js`, `migrations/006_audit_logging.sql`, tests                                                   |
| 5    | Auth hardening / crypto / rate-limit support |      Medium | Crypto helpers, rate-limit tweak, auth router changes to support above flows                            | `src/shared/crypto.js`, `src/services/rate-limit.js`, `src/routers/auth.js`, `src/bootstrap/router-registry.js`, tests                                                                     |
| 6    | UI/bootstrap integration                     |      Medium | App bootstraps new pages/features into SPA flow                                                         | `public/js/bootstrap/app.js`, `public/js/features/admin/admin.js`, `public/js/features/account/account.js`                                                                                 |
| 7    | Test coverage + fixtures                     |      Medium | New unit/e2e coverage for merged slices                                                                 | `tests/e2e/frontend/*`, `tests/unit/*`, `src/*/*.test.js`                                                                                                                                  |

## Not feature work

- `package-lock.json` → dependency churn
- screenshots, debug scripts, temp plans → junk
- Playwright auth-spec cleanup → test maintenance, not product feature

## Current safe merge guidance

- Merge durable slices only
- Keep auth/browser proof current before merge
- Drop generated/debug artifacts
- Prefer env-driven creds and config-driven base URLs in e2e tests
