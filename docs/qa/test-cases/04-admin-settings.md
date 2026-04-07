# Admin Settings Tests (Tests #41-54)

## TEST #41: User Settings - Integrations Tab - Enable Server Button

**Date/Time:** 2026-04-01 22:52  
**Page:** http://127.0.0.1:8787/settings/connections#integrations  
**Test Type:** Functional - Button Action  
**Status:** ❌ FAILED - Button click did not change state

### Steps
1. Opened user settings modal via profile menu
2. Navigated to Integrations tab
3. Located PERSONAL exa server entry (status: DISABLED)
4. Clicked "Enable server" button (uid=44_24)

### Expected Result
- PERSONAL exa server status should change from DISABLED to ENABLED
- Button text should change or button should become disabled
- Save button should become enabled (dirty state)

### Actual Result
- Button click registered (focus state visible)
- Server status remained DISABLED
- No state change occurred
- No error message displayed

### Evidence
- Screenshot before: `test-41-integrations-enable-server.png`
- Screenshot after: `test-42-integrations-enable-result.png`
- AI Vision Analysis: "The toggle switch for the personal exa server is positioned to the left and is greyed out, which indicates that it is currently Off/Disabled"

### Root Cause Analysis
The "Enable server" button appears to be non-functional. The click event may not be wired to the backend API call, or the API call is failing silently without user feedback.

### Severity
**HIGH** - Core functionality (enabling integrations) is broken

---

## TEST #42: User Settings - Integrations Tab - Edit Server Modal

**Date/Time:** 2026-04-01 22:54  
**Page:** http://127.0.0.1:8787/settings/connections#integrations  
**Test Type:** Functional - Modal UI  
**Status:** ✅ PASSED - Modal opened and rendered correctly

### Steps
1. Clicked edit button (uid=44_23) on PERSONAL exa server entry
2. Verified modal opened with correct content

### Expected Result
- Modal titled "Edit MCP Server" should open
- Fields should display: SERVER NAME, URL, AUTH TYPE, HEADERS
- Buttons should display: Delete, Save, Close (X)
- Current values should be pre-populated

### Actual Result
- Modal opened successfully
- All expected fields visible and properly labeled
- SERVER NAME field shows "exa"
- URL field shows "https://mcp.exa.ai/mcp"
- AUTH TYPE dropdown shows "None" (with options: None, Bearer Token, Basic Auth, OAuth 2.0 (PKCE))
- HEADERS field is empty with placeholder text
- Delete and Save buttons visible in footer
- Close button (X) visible in top-right

### Evidence
- Screenshot: `test-43-integrations-edit-server-modal.png`
- AI Vision Analysis: Modal is well-structured, clean layout, high contrast Save button, appropriate background blur

### Issues Found
- HEADERS field is small - may be difficult for users to input complex JSON headers
- Refresh icon in URL field purpose is unclear to users (does it re-fetch manifest?)

### Severity
**LOW** - UI/UX improvement opportunity, not a functional bug

---

## TEST #43: User Settings - Integrations Tab - Toggle Tools Button

**Date/Time:** 2026-04-01 22:56  
**Page:** http://127.0.0.1:8787/settings/connections#integrations  
**Test Type:** Functional - UI State  
**Status:** ⚠️ PARTIAL - Button works but reveals UI/UX issues

### Steps
1. Clicked "Toggle tools" button (uid=44_25) on PERSONAL exa server
2. Verified tool list expanded

### Expected Result
- Tool list should expand showing all available tools
- Tools should be toggleable if server is enabled
- UI should clearly indicate disabled state

### Actual Result
- Tool list expanded successfully showing 3 tools:
  - web_search_exa
  - crawling_exa
  - get_code_context_exa
- Tool toggle buttons are disabled (grayed out) because parent server is disabled
- Tools display shows "3 / 3 enabled" but server status is "DISABLED"

### Evidence
- Screenshot: `test-44-integrations-toggle-tools.png`
- AI Vision Analysis identified multiple issues

### Issues Found

| Issue | Severity | Recommendation |
|-------|----------|-----------------|
| Confusing State Indicator - Tools show "3 / 3 enabled" but server is "DISABLED" | MEDIUM | Update counter to show "0 / 3 available" when server is disabled |
| Low Contrast Text - Tool descriptions rendered in light gray | MEDIUM | Increase contrast of tool description text to meet WCAG AA standards |
| Disabled Tool Buttons - Visual feedback could be clearer | MEDIUM | Add visual indicator (icon or badge) showing tools are disabled |

### Severity
**MEDIUM** - UX issue affecting clarity and accessibility

---

## TEST #44: User Settings - Integrations Tab - Hide Shared Server

**Date/Time:** 2026-04-01 22:57  
**Page:** http://127.0.0.1:8787/settings/connections#integrations  
**Test Type:** Functional - State Management  
**Status:** ✅ PASSED - Button works and triggers dirty state

### Steps
1. Clicked "Hide for me" button (uid=51_34) on SHARED exa server
2. Verified state change and dirty indicator

### Expected Result
- Button should change to "Show for me"
- Unsaved changes indicator should appear
- Save button should become enabled

### Actual Result
- Button text changed from "Hide for me" to "Show for me" ✓
- "Unsaved changes" indicator appeared at bottom-left ✓
- Save button became enabled ✓
- No error messages displayed ✓

### Evidence
- Screenshot: `test-45-integrations-hide-shared-server.png`
- AI Vision Analysis: Confirmed "Unsaved changes" indicator and Save button visible

---

## TEST #45: User Settings - Integrations Tab - Save Operation

**Date/Time:** 2026-04-01 23:02  
**Page:** http://127.0.0.1:8787/settings/connections#integrations  
**Test Type:** Functional - Save/Persistence  
**Status:** ❌ FAILED - Save operation stuck in loading state

### Steps
1. Clicked "Hide for me" button on SHARED exa server (triggered dirty state)
2. Clicked Save button
3. Waited 5+ seconds for save to complete

### Expected Result
- Save button should show "Saving..." briefly
- After completion, button should return to normal state
- "Unsaved changes" indicator should disappear
- Changes should persist

### Actual Result
- Save button shows "Saving..." and remains in loading state
- After 5+ seconds, still shows "Saving..."
- "Unsaved changes" indicator still visible
- No error message displayed to user
- Console shows JavaScript errors: `Uncaught ReferenceError: escapeSelector is not defined`

### Evidence
- Screenshot: `test-46-integrations-save-result.png`
- Screenshot: `test-47-integrations-save-complete.png`
- Console errors: escapeSelector is not defined (2 instances)
- Additional console issues: 12 form fields missing labels

### Root Cause Analysis
The save operation appears to be failing silently due to JavaScript errors. The `escapeSelector` function is not defined, which is likely being called during the save operation. This causes the save to hang indefinitely without user feedback.

### Severity
**CRITICAL** - Core functionality (saving settings) is completely broken

---

## TEST #46-54: Admin Settings Pages Summary

**TEST #46: Admin Settings - Connections Page - Layout and UI**
- Status: ⚠️ PARTIAL - Page renders but has UI/UX issues
- Issues: Misaligned header, low contrast text, sparse layout, unclear icon purpose
- Severity: MEDIUM

**TEST #47: Admin Settings - Add Connection Modal - Form Fields**
- Status: ⚠️ PARTIAL - Form renders but has conflicting labeling
- Issues: API KEY field has asterisk (*) but helper text says "Optional"
- Severity: MEDIUM

**TEST #48: Admin Settings - Add Connection - Form Submission**
- Status: ✅ PASSED - New connection added to list successfully
- Findings: Form submission works, modal closes, unsaved changes indicator appears

**TEST #49: Admin Settings - Save Operation - Persistence**
- Status: ✅ PASSED - Save operation completed successfully
- Findings: Admin settings save functionality is working correctly

**TEST #50: Admin Settings - Models Page - Layout and UI**
- Status: ⚠️ PARTIAL - Page renders but has multiple UI/UX issues
- Issues: Low contrast text, column alignment issues, wasted whitespace, pagination styling, toggle accessibility
- Severity: MEDIUM

**TEST #51: Admin Settings - Models Page - Pagination Functionality**
- Status: ✅ PASSED - Pagination works correctly
- Findings: Page navigation, model filtering, and pagination state all working

**TEST #52: Admin Settings - Models Page - Page 3 Navigation**
- Status: ✅ PASSED - Page 3 displays correctly with final models
- Findings: Pagination fully functional across all 3 pages

**TEST #53: Admin Settings - Models Page - Search Functionality**
- Status: ✅ PASSED - Search filters models correctly
- Findings: Search filtering working in real-time with "Clear search" button

**TEST #54: Admin Settings - Integrations Page - Layout and UI**
- Status: ⚠️ PARTIAL - Page renders but has UI/UX issues
- Issues: Excessive whitespace, low contrast text, ambiguous icons, unclear chevron purpose, visual hierarchy issues
- Severity: MEDIUM

## TEST #55: User Settings - Connections Tab - Test Connection Error Messaging

**Date/Time:** 2026-04-06 19:36  
**Page:** http://localhost:8787/  
**Test Type:** Functional - Error Messaging / API Feedback  
**Status:** ❌ FAILED - Connection test shows opaque internal error reference

### Steps
1. Opened user settings modal via profile menu
2. Opened Add Connection dialog
3. Filled connection form with:
   - Name: `Test QA Connection`
   - URL: `https://api.example.com/v1`
   - API Key: `test-key`
4. Clicked `Test connection`

### Expected Result
- Button should report the backend failure reason clearly
- The modal should show a human-readable message for the failed discovery request
- No opaque internal reference should be surfaced to the user

### Actual Result
- Console reported `401 Unauthorized` followed by `502 Bad Gateway` for `/api/users/me/resources/connections/test`
- The modal showed `internal error; reference = m92lfjtvgd862b49eo5d0f9q`
- The failure detail was not presented as a user-friendly message

### Evidence
- Browser snapshot: `.playwright-cli/page-2026-04-06T19-36-11-975Z.yml`
- Console log: `.playwright-cli/console-2026-04-06T19-34-38-884Z.log`

### Severity
**MEDIUM** - The test flow fails gracefully at the transport layer, but the UI hides the actionable backend error and leaves users with an opaque internal reference.

---

## Summary

**Total Tests:** 15  
**Passed:** 5 (33%)  
**Partially Tested:** 8 (53%)  
**Failed:** 2 (13%)

**Critical Issues:** 1
- Save operation stuck in loading state (escapeSelector error)

**Key Findings:**
- Admin settings pages are mostly functional but have multiple UI/UX issues
- Save operations work in admin pages but fail in user settings
- Multiple accessibility and contrast violations throughout
- Form field labeling inconsistencies
- Pagination and search functionality working correctly
- Connection test errors need clearer user-facing messaging
