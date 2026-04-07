# GrowChat Post-Security-Hardening Roadmap

## Context

PR #16 (Security hardening) merged to main. Three categories of work remain:

1. **#1 - Forgot Password (HIGH priority)** — BLOCKING production readiness
   - Password reset flow implemented server-side but frontend "Forgot Password" link missing
   - Users cannot initiate password recovery from login screen
   - Already have: Email service (Resend), password reset tokens table, backend endpoints (`/api/auth/forgot-password`, `/api/auth/reset-password`)
   - Need: Frontend "Forgot Password" link on login page, modal integration

2. **#2 - Accessibility Issues (18 MEDIUM)** — WCAG compliance gaps
   - Screen reader compatibility, keyboard navigation, ARIA attributes
   - Existing: Strong foundation with ARIA labels, semantic HTML, keyboard support
   - Gaps: Focus management in modals, explicit focus traps, keyboard shortcut documentation

3. **#3 - UX Issues (34 LOW)** — Polish and refinement
   - Minor UI/UX improvements (button states, loading indicators, error messages, form validation)
   - Existing: Good patterns with toasts, disabled states, loading spinners
   - Gaps: Additional feedback, edge case handling, micro-interactions

---

## Work Units (8 Independent Tasks)

### UNIT 1: Forgot Password UI Integration (HIGH, 2 files)
**Files:** `public/auth.html`, `public/js/bootstrap/auth.js`
**Description:** Add "Forgot Password" link on login form that opens existing password reset modal
- Link already has modal implementation, just needs UI integration
- E2E: Click forgot password → modal opens → enter email → success message

### UNIT 2: Modal Focus Management (MEDIUM, 2 files)
**Files:** `public/js/shared/components/viewport-modal-shell.js`, create `public/js/shared/utils/focus-trap.js`
**Description:** Implement focus trap in modals (tab cycles within modal), restore focus on close
- E2E: Tab through modal, verify focus stays inside → close modal, focus returns to trigger

### UNIT 3: Keyboard Navigation Enhancement (MEDIUM, 3 files)
**Files:** `public/js/shared/components/search-input.js`, `public/js/features/admin/settings/integrations.js`, create `public/js/shared/utils/keyboard-shortcuts.js`
**Description:** Add keyboard shortcuts documentation, enhance dropdown navigation, ensure all controls keyboard accessible
- E2E: Navigate entire app with keyboard only, verify all controls reachable

### UNIT 4: ARIA & Semantic HTML Audit (MEDIUM, 4 files)
**Files:** `public/auth.html`, `public/index.html`, `public/js/shared/components/form-label-with-helper.js`, `public/js/shared/components/viewport-modal-shell.js`
**Description:** Add missing aria-describedby, aria-controls, verify heading hierarchy, ensure form fields properly associated
- E2E: Run axe accessibility audit, verify no violations

### UNIT 5: Enhanced Form Validation & Feedback (LOW, 2 files)
**Files:** `public/js/shared/components/form-label-with-helper.js`, `public/js/bootstrap/auth.js`
**Description:** Add inline validation feedback as user types, improve error message clarity, add success state styling
- E2E: Fill form with invalid data, verify inline errors → fix errors, verify success state

### UNIT 6: Loading & Disabled State Polish (LOW, 2 files)
**Files:** `public/js/shared/components/settings-action-footer.js`, `public/js/features/chat/message-input.js`
**Description:** Enhance button loading states with better visual feedback, add spinners to async operations, improve cursor feedback
- E2E: Trigger async operations, verify loading state → success → state update

### UNIT 7: Toast Notification Improvements (LOW, 1 file)
**Files:** Create `public/js/shared/components/toast.js`
**Description:** Create toast container component, improve positioning/auto-dismiss/stacking, add toast types (success, error, warning, info)
- E2E: Trigger various toast scenarios, verify positioning and dismissal

### UNIT 8: Error Message Sanitization & Clarity (LOW, 2 files)
**Files:** `src/utils/response.js`, `public/js/bootstrap/auth.js`
**Description:** Review and improve error messages across app, ensure user-friendly language (not technical)
- E2E: Trigger various errors, verify messages are clear and helpful

---

## E2E Test Recipe

**Frontend Changes (Units 1-7):**
1. Start dev server: `npm run dev`
2. Open http://localhost:8787
3. Follow unit-specific interaction pattern
4. Screenshot result
5. Verify no console errors

**Auth Changes (Unit 1):**
- Login page loads without errors
- Forgot password link visible and clickable
- Modal opens and closes properly
- Email submission works
- Success message displays

**Accessibility Changes (Units 2-4):**
- Use browser DevTools keyboard navigation (Tab, Shift+Tab, Enter, Escape, Arrow keys)
- Run axe accessibility audit in DevTools
- Verify no WCAG 2.1 AA violations

**UX Changes (Units 5-8):**
- Fill forms with various input (valid, invalid, edge cases)
- Trigger async operations and verify loading states
- Check error and success messages display correctly
- Verify toast notifications appear and auto-dismiss

---

## Worker Instructions (All Units)

After implementing your assigned unit:

1. **Review & Simplify** — Use `simplify` skill to clean up code
2. **Run Tests** — `npm test`
3. **E2E Verification** — Follow the recipe for your unit
4. **Commit** — Clear message following conventional commits
5. **Push & Create PR** — `gh pr create --title "..."` with descriptive title
6. **Report** — End with `PR: <url>` or `PR: none — <reason>`

---

## Success Criteria

- All 8 units have passing code review
- No accessibility violations (axe audit)
- All E2E tests pass
- User can reset password via "Forgot Password" link
- App is fully keyboard navigable
- All interactive elements have proper ARIA labels

---

## Dependencies

None — all units are independent and can be implemented in parallel.
