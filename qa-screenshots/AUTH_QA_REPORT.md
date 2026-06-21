# Auth QA Test Report

**Date:** 2025-06-21  
**Target:** http://localhost:8787  
**Credentials:** admin@localhost / admin123  
**Agent:** Agent 1 (Auth QA)

---

## Summary

| Section | Result |
|---------|--------|
| Login Flow | **14/15 PASS** |
| Password Reset | **5/5 PASS** |
| Registration | **3/5 PASS** (2 issues found) |
| **Total** | **22/25 PASS** |

---

## 1. Login Flow

### 1.1 Open auth page
- **Status:** PASS
- **Page:** http://localhost:8787/auth.html
- **Screenshot:** `auth-idle.png`

### 1.2 Verify Title
- **Status:** ⚠️ PARTIAL — Page `<title>` is "GrowChat Auth" (not "Sign in to GrowChat"). The H1 heading **does** read "Sign in to GrowChat."

### 1.3 Email Input Attributes
- **Status:** PASS
- **Type:** text
- **Autocomplete:** email
- **Required:** yes

### 1.4 Password Input Attributes
- **Status:** PASS
- **Type:** password
- **Minlength:** 8
- **Autocomplete:** current-password
- **Required:** yes

### 1.5 Submit Button (Idle)
- **Status:** PASS
- **Disabled:** yes (initially)

### 1.6 Fill Credentials
- **Status:** PASS
- **Email:** admin@localhost
- **Password:** admin123

### 1.7 Submit Button (After Fill)
- **Status:** PASS
- **Disabled:** no (enabled after valid input)

### 1.8 Submit & Redirect
- **Status:** PASS
- **Redirect:** http://localhost:8787/?app=1

### 1.9 Post-Login State
- **Status:** PASS
- **Chat composer visible:** yes
- **Screenshot:** `post-login.png`
- **Elements found:**
  - "How can I help you today?" heading
  - Message textbox (ref=e14)
  - Attach file button
  - Voice input button
  - Model selector
  - "New Chat" button
  - "Admin" user in sidebar (online)

---

## 2. Password Reset Flow

### 2.1 Navigate to Auth Page
- **Status:** PASS

### 2.2 Open Forgot Password
- **Status:** PASS
- **Clicked:** "Forgot password?"

### 2.3 Modal Verification
- **Status:** PASS
- **Modal title:** "Reset your password"
- **Email input:** visible, required
- **Buttons:** "Send reset link", "Cancel"

### 2.4 Fill & Submit
- **Status:** PASS
- **Email:** admin@localhost
- **Submitted:** yes

### 2.5 Aftermath
- **Status:** PASS
- **Server returned:** Check your email for a password reset link (success)
- **Modal:** auto-closes after 2 seconds
- **Screenshot:** `password-reset-result.png` (shows auth page after modal closed)

---

## 3. Registration Flow

### 3.1 Open Register Mode
- **Status:** PASS
- **Clicked:** "Sign up" toggle

### 3.2 Form Verification
- **Status:** PASS
- **Fields:** Name, Email, Password
- **Name field:** dynamically shown, required
- **Form heading:** "Create an account"

### 3.3 Fill Registration Form
- **Status:** PASS
- **Name:** QA User
- **Email:** qa-test-123@local.com
- **Password:** TestPass1234

### 3.4 Submit Registration
- **Status:** ⚠️ FAIL
- **Issue:** Backend returns `403 Forbidden` with `{"error":"Public registration is disabled"}`
- **Screenshot:** `register-result.png`
- **Expected:** Error message should be displayed to user
- **Actual:** No error message visible on the page; form remains unchanged

### 3.5 User Feedback
- **Status:** FAIL
- **Expected after submit:** Either success redirect OR error message shown
- **Actual:** Form stays on the same page with no visible feedback to user

---

## Issues Found

### Issue #1: Page Title Mismatch
- **Severity:** Low
- **Page `<title>`** is "GrowChat Auth" but accessibility tree / H1 heading shows "Sign in to GrowChat"

### Issue #2: Registration Error Not Displayed
- **Severity:** High
- **Description:** When registration is disabled server-side (403 "Public registration is disabled"), the frontend does **not** display the error message to the user. The form stays on the same page with no visible feedback. This appears to be a frontend bug in the `auth.js` error handling or a CSS/visibility issue with the error paragraph.
- **Expected:** Error text visible below the form buttons
- **Screenshot:** See `register-result.png`

---

## Screenshots

| Name | Description |
|------|-------------|
| `auth-idle.png` | Auth page in idle state, submit button disabled |
| `post-login.png` | Chat page after successful login with composer visible |
| `password-reset-result.png` | Auth page after forgot-password request (modal closed) |
| `register-result.png` | Registration form after submit attempt with no visible error |

---

## Test Logs

All test steps were performed via `agent_browser` using Playwright on Chromium. No JavaScript console errors were observed during login or password reset flows. The registration failure is purely server-side (backend config `public_registration: false`), but the missing UI feedback is a frontend issue.
