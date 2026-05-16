# UI/UX Feature Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire existing disconnected UI feature components (Email Verification, Sessions, Message Edit, Audit Logs) into the main SPA routing and layouts.

**Architecture:** Inject route handlers into `app.js` for verification, add navigation tabs to `account.js` and `admin.js` layouts, and add action buttons to chat message hover menus.

**Tech Stack:** Vanilla JS, DOM manipulation, Tailwind CSS, Playwright.

---

### Task 1: Email Verification Routing

**Files:**
- Modify: `public/js/bootstrap/app.js`
- Test: `tests/e2e/frontend/auth.spec.ts`

**Layout:**
```text
Route: /verify?token=...
--------------------------------------------------
|                                                |
|             [ GrowChat Logo ]                  |
|                                                |
|             Verifying email...                 |
|             (Spinner/Status)                   |
|                                                |
--------------------------------------------------
```

- [ ] **Step 1: Write the failing test**

```javascript
// tests/e2e/frontend/auth.spec.ts
import { test, expect } from '@playwright/test';

test('navigating to /verify loads verification UI', async ({ page }) => {
  await page.goto('/verify?token=test-token');
  await expect(page.locator('text=Verifying')).toBeVisible({ timeout: 5000 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/frontend/auth.spec.ts -g "navigating to /verify"`
Expected: FAIL (Timeout waiting for locator)

- [ ] **Step 3: Write minimal implementation**

```javascript
// public/js/bootstrap/app.js
// Inside the main route matching logic:

if (path === '/verify') {
  const token = url.searchParams.get('token');
  if (token) {
    import('../features/auth/verification-success.js')
      .then(m => m.renderVerificationSuccess(appRoot, token));
  } else {
    import('../features/auth/verification-pending.js')
      .then(m => m.renderVerificationPending(appRoot));
  }
  return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/frontend/auth.spec.ts -g "navigating to /verify"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/bootstrap/app.js tests/e2e/frontend/auth.spec.ts
git commit -m "feat(ui): wire email verification routes in SPA"
```

---

### Task 2: Session Management Account Tab

**Files:**
- Modify: `public/js/features/account/account.js`
- Test: `tests/e2e/frontend/admin-settings.spec.ts`

**Layout:**
```text
My Settings Drawer
--------------------------------------------------
| Connections       | Active Sessions            |
| Models            |                            |
| Integrations      | [ Current Device ]         |
| Security          |                            |
| *Sessions*        | [ Revoke all other ]       |
--------------------------------------------------
```

- [ ] **Step 1: Write the failing test**

```javascript
// tests/e2e/frontend/admin-settings.spec.ts
test('account drawer has Sessions tab', async ({ page }) => {
  await page.goto('/account');
  await expect(page.locator('button[data-account-area-tab="sessions"]')).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/frontend/admin-settings.spec.ts -g "account drawer has Sessions"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```javascript
// public/js/features/account/account.js
// Add to sidebar HTML generation:
`
<button data-account-area-tab="sessions" class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
  Sessions
</button>
`

// Add to switch block handling tab clicks:
case 'sessions':
  import('./sessions.js').then(m => m.renderSessionsList(contentArea));
  break;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/frontend/admin-settings.spec.ts -g "account drawer has Sessions"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/features/account/account.js tests/e2e/frontend/admin-settings.spec.ts
git commit -m "feat(ui): add Sessions tab to account drawer"
```

---

### Task 3: Audit Logs Admin Tab

**Files:**
- Modify: `public/js/features/admin/admin.js`
- Test: `tests/e2e/frontend/admin-settings.spec.ts`

**Layout:**
```text
Admin Workspace
--------------------------------------------------
| Users | Settings | System | *Audit Logs*       |
|------------------------------------------------|
|                                                |
|  [Search/Filter]                               |
|  TIMESTAMP | ACTOR | ACTION | RESOURCE         |
|  ...                                           |
--------------------------------------------------
```

- [ ] **Step 1: Write the failing test**

```javascript
// tests/e2e/frontend/admin-settings.spec.ts
test('admin workspace has Audit Logs tab', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.locator('button[data-admin-main-tab="audit"]')).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/frontend/admin-settings.spec.ts -g "admin workspace has Audit Logs"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```javascript
// public/js/features/admin/admin.js
// Add to top nav HTML:
`
<button data-admin-main-tab="audit" class="px-4 py-3 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-gray-700">
  Audit Logs
</button>
`

// Add to route handler block:
if (mainTab === 'audit') {
  import('./audit-logs.js').then(m => m.renderAuditLogs(mainContentArea));
  return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/frontend/admin-settings.spec.ts -g "admin workspace has Audit Logs"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/features/admin/admin.js tests/e2e/frontend/admin-settings.spec.ts
git commit -m "feat(ui): add Audit Logs tab to admin workspace"
```

---

### Task 4: Message Edit Button

**Files:**
- Modify: `public/js/features/chat/chat-message-actions.js`
- Test: `tests/e2e/frontend/chat.spec.ts`

**Layout:**
```text
Chat Message Bubble (Hover state)
--------------------------------------------------
| You                                            |
| This is a message.                             |
|                                                |
|                      [Copy] [Regenerate] [Edit]|
--------------------------------------------------
```

- [ ] **Step 1: Write the failing test**

```javascript
// tests/e2e/frontend/chat.spec.ts
test('user messages show edit button on hover', async ({ page }) => {
  await page.goto('/');
  await page.fill('#message-input, textarea', 'Hello');
  await page.click('#send-btn');
  const msg = page.locator('.message-bubble').first();
  await msg.hover();
  await expect(msg.locator('button[title="Edit"]')).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/frontend/chat.spec.ts -g "user messages show edit button"`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```javascript
// public/js/features/chat/chat-message-actions.js
// Add to action bar HTML generation for user roles:
`
<button class="edit-msg-btn text-gray-400 hover:text-[#0066cc] transition p-1" title="Edit">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
</button>
`

// Add event listener binding:
container.addEventListener('click', (e) => {
  const editBtn = e.target.closest('.edit-msg-btn');
  if (editBtn) {
     const msgId = editBtn.closest('[data-message-id]').dataset.messageId;
     import('./chat-message-edit.js').then(m => m.enableEditMode(msgId));
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/frontend/chat.spec.ts -g "user messages show edit button"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/features/chat/chat-message-actions.js tests/e2e/frontend/chat.spec.ts
git commit -m "feat(ui): wire message edit button to chat bubbles"
```