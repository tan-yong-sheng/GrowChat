# Unresolved Issues & Condensed Testing Appendix (Tests #9-40)

> **Purpose:** This document is a condensed appendix and unresolved-items tracker, NOT a duplicate of canonical tests. For detailed test cases, see the other test-case files. This file focuses on issues that need resolution and rapid testing notes.

## Unresolved Issues Summary

### Blocking Issues
- **escapeSelector is not defined** - Save operation hangs in user settings modal (Integrations tab)
- **Missing "Forgot Password" link** - Authentication page lacks password recovery option

### Medium-Priority Issues

**Contrast & Accessibility:**
- Subtext "The smarter way to chat" - light gray on white (insufficient contrast)
- Helper text in forms - insufficient contrast
- Placeholder text - low visibility
- Input borders - very subtle, may disappear
- Low contrast badges ("PERSONAL", "SHARED", "DISABLED")
- Low contrast text in admin tables and modals

**Missing Visual Affordances:**
- Read-only fields lack visual distinction
- Disabled buttons have no explanation
- Selected dropdown items only show checkmark (weak affordance)
- Message bubbles not differentiated from background
- Missing active tab indicator in settings modal

**Focus & Interaction States:**
- Input fields lack visible focus indicators
- Buttons have no hover states
- Dropdown options lack hover feedback

**UI/UX Issues:**
- Model name "deepseek-v3.2" displayed redundantly (3 times)
- Excessive whitespace on wide screens
- Tight vertical spacing between options
- Large gap between greeting and input field
- Timestamps show "Unknown date" in search results

### Low-Priority Issues

**Content & Layout:**
- Redundant content display
- Excessive whitespace
- Tight vertical spacing
- Large gaps between elements

**Missing Features:**
- No Copy button for messages
- No Regenerate button for responses
- No feedback buttons (thumbs up/down)
- No loading spinners during requests

**Mobile Optimization:**
- Touch targets may be smaller than 44x44px
- Icon spacing too tight for touch
- Sidebar icons lack visual weight

**Other:**
- Button hover states missing
- Form centering issues
- Touch target sizes suboptimal
- Tab switching lacks visual feedback
- Error message styling needs verification
- Success message styling needs verification
- Loading state lacks visual feedback (no spinners)
- Tab navigation order needs verification
- Screen reader support needs verification
- Color contrast issues throughout

## Partially Tested Features

**TEST #12: File Attachment**
- Status: ⚠️ PARTIAL - Button present but functionality not fully tested
- Findings: Attach file button visible, expandable menu present

**TEST #13: Voice Input**
- Status: ⚠️ PARTIAL - Button present but functionality not fully tested
- Findings: Voice input button visible, microphone icon present
- Note: Intentionally not implemented yet; planned for future

**TEST #14: Tools Menu**
- Status: ⚠️ DISABLED - Tools button is disabled
- Findings: Tools button present but disabled (uid=84_20 disableable disabled)

**TEST #21-24: Form Validation Edge Cases**
- Status: ⚠️ NEEDS VERIFICATION
- Findings: Email format validation, password strength requirements, API key validation, base URL validation need testing

**TEST #31-35: Keyboard Navigation & Hover States**
- Status: ⚠️ NEEDS VERIFICATION
- Findings: Button hover states, input focus states, tab order, keyboard navigation need verification

**TEST #39-40: Accessibility & Screen Reader Support**
- Status: ⚠️ NEEDS VERIFICATION
- Findings: ARIA labels present but screen reader support needs full testing

## Known Functional Issues

**TEST #28: Message Timestamp Display**
- Issue: Timestamps show "Unknown date" in search results
- Root Cause: Timestamp data not being populated from database
- Status: Unresolved

**Settings Save / Integrations Actions**
- Issue: One settings save flow can hang in a loading state
- Status: CRITICAL - blocks user settings changes
- Note: See `04-admin-settings.md` and `05-user-settings-admin-pages.md` for the detailed settings evidence

## Testing Notes

**Admin Pages Status:**
- Admin users page: Renders and functions, multiple UI/UX issues
- Admin settings connections: Renders, UI/UX issues
- Admin settings models: Renders, pagination and search working
- Admin system settings: Renders, multiple UI/UX issues

**Form Validation Status:**
- Empty email validation: ✅ Working
- Empty password validation: ✅ Working
- Invalid email format: ⚠️ Needs verification
- Short password: ⚠️ Needs verification
- API key validation: ⚠️ Needs verification
- Base URL validation: ⚠️ Needs verification

**UI/UX Interaction Status:**
- Model selector search: ✅ Functional
- Model selector option selection: ✅ Functional
- Chat title display: ✅ Functional
- Sidebar collapse/expand: ✅ Functional
- Responsive layout (desktop): ✅ Functional
- Button hover states: ⚠️ Needs verification
- Input focus states: ⚠️ Needs verification
- Keyboard navigation (tab order): ⚠️ Needs verification
- Keyboard navigation (Enter key): ✅ Functional
- Keyboard navigation (Escape key): ✅ Functional

**Error & Success Handling:**
- Error message display: ✅ Functional
- Success message display: ✅ Functional
- Loading states: ⚠️ Partial - button text changes but no spinner

---

*For detailed test cases and evidence, see canonical test files: 01-authentication.md, 02-home-page.md, 04-admin-settings.md, 05-user-settings-admin-pages.md, 06-search-mobile-advanced.md*
