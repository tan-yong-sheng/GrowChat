# GrowChat Prioritized Action Plan

> Synthesized from codebase gap analysis | Date: 2026-04-14

---

## Executive Summary

This document synthesizes the GrowChat codebase gap analysis into a prioritized action plan. **41 distinct gaps** were identified across 7 categories. They are now organized into **P0 (Critical)**, **P1 (Important)**, and **P2 (Nice-to-have)** priorities with effort and impact estimates.

---

## P0 — Critical (Must Fix)

These gaps expose the application to significant security risks, functional limitations, or developer experience blockers.

| # | Gap | Effort | Impact | Rationale |
|---|-----|--------|--------|-----------|
| 1 | **Message Search** | L | High | Core UX feature; users cannot find past conversations |
| 2 | **Direct/DM Chats** | L | High | Fundamental chat app feature; currently group-chat only |
| 3 | **Email Verification** | M | High | Security requirement; unverified accounts can access system |
| 4 | **CSRF on API Routes** | M | High | Documented security vulnerability; session-based only |
| 5 | **API Integration Tests** | L | High | Testing gap; no confidence in API contract correctness |
| 6 | **TypeScript Migration** | XL | High | Developer experience; zero type safety in codebase |
| 7 | **Offline Mode** | L | High | Resilience; app completely fails without network |

### P0 Notes
- **Message Search** and **DM Support** are table-stakes for any chat application
- **Email Verification** should block account activation until confirmed
- **CSRF** requires either CSRF tokens or switching to `SameSite=Strict` cookies
- **API Integration Tests** should use Supertest or similar to validate routes
- **TypeScript** should be adopted incrementally — start with new files, then progressively migrate
- **Offline Mode** needs Service Worker + IndexedDB for message queue persistence

---

## P1 — Important (Should Fix)

Significant gaps that improve security, usability, or development velocity.

| # | Gap | Effort | Impact | Rationale |
|---|-----|--------|--------|-----------|
| 8 | **2FA/MFA** | M | Med | Security hardening; protects against credential theft |
| 9 | **Message Editing** | S | Med | User expectation; messages cannot be corrected after sending |
| 10 | **Message Reactions** | S | Med | Standard chat feature; Discord/Slack-style emoji reactions |
| 11 | **Message Threads** | M | Med | Conversation organization; replies lack threading |
| 12 | **User Message Deletion** | S | Med | User autonomy; only admins can delete messages |
| 13 | **Data Export (GDPR)** | M | Med | Compliance; users cannot request their data |
| 14 | **Data Deletion (GDPR)** | M | Med | Compliance; users cannot delete their account/data |
| 15 | **Audit Logging** | M | Med | Accountability; no trail of admin actions |
| 16 | **Session Management UI** | S | Med | User control; cannot see/revoke active sessions |
| 17 | **Load/Performance Tests** | L | Med | Stability; no confidence under traffic |
| 18 | **Error Tracking (Sentry)** | M | Med | Observability; no centralized error collection |
| 19 | **ARIA Labels** | M | Med | Accessibility; many interactive elements lack labels |
| 20 | **Keyboard Navigation** | M | Med | Accessibility; not fully keyboard accessible |
| 21 | **Function/Tool Calling UI** | M | High | LLM feature gap; tools configured but no user-facing UI |
| 22 | **Conversation Branching** | M | Med | LLM UX; cannot branch/clone conversations |
| 23 | **Chat Continuation After Restart** | M | High | Streaming resilience; messages can be lost |

### P1 Notes
- **GDPR compliance** (items 13-14) should be addressed regardless of priority
- **Accessibility** (items 19-20) has legal implications (ADA, WCAG)
- **Load testing** should use k6 or Locust; integrate into CI pipeline
- **Error tracking** can be added via `@sentry/cloudflare` in <1 day

---

## P2 — Nice-to-Have

Enhancements that improve UX or developer experience but are not blockers.

| # | Gap | Effort | Impact | Rationale |
|---|-----|--------|--------|-----------|
| 24 | **Message Read Receipts** | S | Low | Nice-to-have; not core to chat functionality |
| 25 | **Typing Indicators** | S | Low | Nice-to-have; adds polish |
| 26 | **Push Notifications** | M | Low | Mobile support; SSE provides real-time already |
| 27 | **Chat Categories/Folders** | M | Low | Organization; not required for MVP |
| 28 | **Chat Export** | S | Low | Nice-to-have; JSON/PDF export |
| 29 | **Vision/Image Support** | M | Low | Multimodal; not required for text chat |
| 30 | **Prompt Engineering UI** | S | Low | Power user feature; system prompts configurable per chat |
| 31 | **Password Strength Enforcement** | S | Low | Security hardening; complementary to 2FA |
| 32 | **Account Lockout** | S | Low | Security; brute-force protection |
| 33 | **IP-based Rate Limiting** | M | Low | Security; granular rate limiting |
| 34 | **API Documentation** | M | Low | DX; no generated API docs |
| 35 | **Architecture Docs** | S | Low | DX; no ARCHITECTURE.md |
| 36 | **CONTRIBUTING.md** | S | Low | DX; no contribution guidelines |
| 37 | **CHANGELOG** | S | Low | DX; no version history |
| 38 | **Hot Reload** | M | Low | DX; full rebuild required |
| 39 | **ESLint/Prettier** | S | Low | DX; no standardized linting |
| 40 | **Global Error Boundary** | S | Low | Resilience; error handling gaps |
| 41 | **Retry Logic for API Calls** | S | Low | Resilience; failed requests not retried |

### P2 Notes
- Many DX items (35-37, 39) can be addressed with scaffolding tools
- **ESLint/Prettier** can be added in <1 hour via `npm init @eslint/config`
- **Hot reload** requires switching from pure JS to a bundler (Vite/Webpack)

---

## Roadmap by Quarter

### Q1 — Foundation (P0)
- [ ] Implement email verification flow
- [ ] Add CSRF protection or SameSite cookie enforcement
- [ ] Add API integration tests (Supertest)
- [ ] Begin TypeScript migration (new files only)
- [ ] Implement offline mode (Service Worker + IndexedDB)
- [ ] Build message search (full-text index via D1)

### Q2 — Core Features (P0 + P1)
- [ ] Implement DM/1:1 chat support
- [ ] Add 2FA/MFA (TOTP)
- [ ] Add GDPR data export/deletion
- [ ] Add audit logging
- [ ] Add session management UI
- [ ] Add error tracking (Sentry)
- [ ] Build LLM tool calling UI
- [ ] Fix message streaming resume

### Q3 — Polish (P1 + P2)
- [ ] Add message editing + reactions + threads
- [ ] Add ARIA labels + keyboard navigation
- [ ] Add load testing pipeline
- [ ] Generate API documentation (Swagger/OpenAPI)
- [ ] Add ESLint/Prettier + hot reload
- [ ] Add architecture/CONTRIBUTING/CHANGELOG docs

### Q4 — Enhancements (P2)
- [ ] Push notifications
- [ ] Typing indicators + read receipts
- [ ] Chat categories/folders
- [ ] Image/vision support
- [ ] Global error boundary + retry logic

---

## Effort Legend

| Code | Description |
|------|-------------|
| S | Small — 1-2 days |
| M | Medium — 1-2 weeks |
| L | Large — 1 month |
| XL | Extra Large — >1 month (phased approach) |

---

## Dependencies

```
P0 ──┬─ Message Search (requires DB full-text index)
     ├─ Email Verification (requires email service integration)
     ├─ CSRF Fix (requires cookie config + token validation)
     ├─ API Integration Tests (requires test framework setup)
     ├─ TypeScript Migration (requires tsconfig + gradual migration)
     └─ Offline Mode (requires Service Worker + IndexedDB)

P1 ──┬─ 2FA (depends on: TOTP library + QR code generation)
     ├─ GDPR Export/Delete (depends on: data export utilities)
     ├─ Audit Logging (depends on: structured logging layer)
     ├─ ARIA Labels (depends on: component audit)
     ├─ Tool Calling UI (depends on: existing tool config already in place)
     └─ Streaming Resume (depends on: message_deltas table already exists)

P2 ──┬─ ESLint/Prettier (no dependencies)
     ├─ Hot Reload (requires: Vite/Webpack bundler)
     ├─ Push Notifications (requires: Web Push + Service Worker)
     └─ API Docs (depends on: API route specs or TSDoc)
```

---

## Risk Considerations

1. **TypeScript Migration (XL)** — High risk of introducing bugs. Mitigate: migrate incrementally, add `tsc --noEmit` to CI before full migration.
2. **Offline Mode** — Complex state sync. Mitigate: use existing `message_deltas` table as sync anchor.
3. **GDPR Compliance** — Legal exposure. Mitigate: prioritize Q2; consult legal for exact requirements.
4. **Email Verification** — Requires Resend already configured. Mitigate: leverage existing password reset flow pattern.

---

## Summary

| Priority | Count | Total Effort |
|----------|-------|--------------|
| P0 (Critical) | 7 | ~3-4 months |
| P1 (Important) | 16 | ~3-4 months |
| P2 (Nice-to-Have) | 18 | ~2-3 months |

**Recommended Approach:** Address all P0 items in Q1-Q2 to establish a solid foundation. Then prioritize P1 items based on user feedback and compliance requirements. P2 items can be tackled opportunistically or as onboarding tasks for new contributors.