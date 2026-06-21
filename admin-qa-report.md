# Admin QA Report — GrowChat

**Test Date:** 2026-06-21  
**Environment:** http://localhost:8787  
**Credentials:** admin@localhost / admin123  
**Agent:** Browser automation (agent_browser)

---

## 1. Login

✅ **Status: PASS**

- Navigated to `http://localhost:8787/auth`
- Filled email: `admin@localhost`, password: `admin123`
- Clicked "Sign in" — redirected to app dashboard (`/?app=1`)
- No console errors or warnings visible on the auth page

---

## 2. Admin Users Overview

✅ **Status: PASS**

- Navigated to `http://localhost:8787/admin/users/overview`
- Users table rendered correctly with **2 users**:
  - `admin@localhost` — **ADMIN** badge (black pill), ACTIVE
  - `admin@ssrf.local` — **ADMIN** badge (black pill), ACTIVE
- **Screenshot:** `admin-users.png` (36.9 KiB)

### Search Filter Test
- Typed `"admin"` into the "Search users" field
- Both users remain visible (both contain "admin")
- No search debounce errors or UI glitches
- Filter behavior is functional

---

## 3. Admin Settings — Connections

✅ **Status: PASS** (page renders, modal opens)

- Navigated to `http://localhost:8787/admin/settings/connections`
- One pre-existing connection visible: `cli-proxy-api` (OpenAI Compatible)
  - URL: `https://proxy3.tanyongsheng.site/v1`
- **Screenshot:** `admin-connections.png` (35.0 KiB)

### Model Toggle Bug — CRITICAL

**Steps Taken:**
1. Clicked the gear (edit) icon on `cli-proxy-api` → "Edit Connection" modal opened
2. Model list loaded with 46 models
3. Checkbox for `agnes/agnes-2.0-flash` was already unchecked (from earlier click)
4. Clicked checkbox for `agnes/agnes-image-2.1-flash` → visually unchecked
5. Model counter updated: `Models selected in this connection: 44`
6. Clicked **Save** — modal remained open, no visible success/error toast
7. Closed modal via X button
8. Reopened the same connection's edit modal

**Exact Behavior Observed:**
- **VISUAL CHANGE:** The checkbox toggles correctly in the UI when clicked (checked → unchecked). The counter decrements (45 → 44).
- **SAVE:** Clicking Save does NOT show any success toast, error message, or visual feedback. The modal stays open.
- **PERSISTENCE:** After closing and reopening the modal, the checkbox **REVERTS** to the original checked state. The model `agnes/agnes-2.0-flash` is checked again.
- **ERROR:** No visible error message, alert, or console popup. The save appears to succeed silently, but nothing persists.

**Root Cause Analysis (from source code review):**
Two distinct bugs contribute:

1. **`newConnection.manualModels` uses stale data**: In `connections-event-handlers.js`, the Save handler builds `newConnection` but sets `manualModels` from `connectionsState.selectedConnection?.manualModels` (the original state), completely ignoring checkbox changes made in the modal.
   ```js
   newConnection.manualModels = normalizeConnectionManualModels(
     connectionsState.selectedConnection?.manualModels  // ← old data
   );
   ```

2. **`model_updates` payload format mismatch**: The frontend `buildSelectedConnectionModels()` returns objects shaped as `{ modelId, name }`, but the backend expects `{ id, enabled }`. The backend attempts `String(item?.id || '')` which yields empty string for every entry. These fail `isValidModelAccessId()` validation, so the `modelUpdates` array becomes empty. The save returns `{ ok: true, model_updates: 0 }` — it looks successful but silently discards model changes.

**Screenshots:**
- `admin-model-toggle-result.png` — After toggling off, count = 44 (both first two models unchecked)
- `admin-reopen-modal.png` — After reopening modal, first model is checked again

**Impact:** Admin users cannot change which models are enabled/disabled for a connection. The feature is completely broken — visual feedback gives false confidence that changes saved successfully.

---

## 4. Admin Users — Roles

✅ **Status: PASS**

- Navigated to `http://localhost:8787/admin/users/roles`
- 2 system roles visible:
  - `admin` — System role, 34 permissions, 11 sensitive
  - `member` — System role, 12 permissions
- **Screenshot:** `admin-other.png` (35.5 KiB)

---

## 5. Admin System — Audit / Registration

✅ **Status: PASS**

- Navigated to `http://localhost:8787/admin/system/audit` (redirected to `/admin/system/registration`)
- Sections visible:
  - **Public Registration** — "Allow New Signups" toggle (currently Off)
  - **Authentication** — "Require email verification" toggle (currently Off)
- Sidebar also shows: Email Delivery, Security Info, Activity Log
- **Screenshot:** `admin-system-audit.png` (40.5 KiB)

---

## Summary

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Login with admin creds | ✅ PASS | Smooth redirect to app |
| 2 | Users table renders with admin badge | ✅ PASS | 2 admin users, badges visible |
| 3 | Search filter by "admin" | ✅ PASS | Both users remain, no errors |
| 4 | Connections page loads | ✅ PASS | 1 connection visible |
| 5 | Expand connection → Edit modal | ✅ PASS | Opens correctly with model list |
| 6 | Toggle model checkbox OFF | ⚠️ BUG | Visual toggle works, but … |
| 7 | Save persists the change | ❌ **FAIL** | Reverts immediately on reopen |
| 8 | Roles page renders | ✅ PASS | 2 system roles visible |
| 9 | System/Registration renders | ✅ PASS | Toggles visible, clean layout |

**Critical Issue:** Model checkbox toggles in the Edit Connection modal do **NOT** persist after Save. The UI gives no error feedback, making it a silent failure that leaves admin users believing settings saved correctly.
