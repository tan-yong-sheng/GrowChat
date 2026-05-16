# Worktree vs Main Branch Gap Analysis
*Target: `.worktrees/short-term` vs `main`*

Backend features exist in the worktree, but the frontend SPA lacks the required wiring to mount them. Features are invisible to the user.

## Identified Gaps

### 1. Email Verification / Onboarding Gate
- **Backend**: `src/routers/email-verification.js` exists. `migrations/004_email_verification.sql` exists.
- **Frontend Files**: `public/js/features/auth/verification-pending.js` and `verification-success.js` exist.
- **UI/UX Gap**: `public/js/bootstrap/app.js` lacks routing logic for `/verify`. The SPA cannot intercept the state to mount pending/success screens. Onboarding flow broken.

### 2. Auth / Session Management
- **Backend**: `src/routers/session-management.js` exists.
- **Frontend Files**: `public/js/features/account/sessions.js` exists.
- **UI/UX Gap**: `public/js/features/account/account.js` lacks support wiring. No "Sessions" tab rendered in the left-hand navigation menu of the My Settings drawer. View cannot be mounted. User cannot revoke sessions.

### 3. Message Editing
- **Backend**: `src/routers/message-edit.js` exists.
- **Frontend Files**: `public/js/features/chat/chat-message-edit.js` exists.
- **UI/UX Gap**: `public/js/features/chat/chat.js` and message rendering loops do not import or invoke the edit component. No "Edit" button wired into the message hover actions (three-dot menu). User cannot trigger edit state.

### 4. Audit Logs / Admin Observability
- **Backend**: `src/services/audit-log.js` exists.
- **Frontend Files**: `public/js/features/admin/audit-logs.js` exists.
- **UI/UX Gap**: `public/js/features/admin/admin.js` missing routing logic. No top-level "Audit Logs" tab next to "Users", "Settings", and "System". Admins cannot navigate to audit interface.

## Conclusion
Code exists. SPA wiring missing. Required next steps: integrate `app.js`, `account.js`, `admin.js`, and `chat.js` to mount existing feature components.