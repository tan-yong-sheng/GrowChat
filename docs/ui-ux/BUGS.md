# Discovered UI/UX Bugs & Design Deviations

This document tracks bugs, unhandled edge cases, and deviations from the Apple-style `DESIGN.md` guidelines discovered during the user flow mapping process.

## Authentication (`/auth.html`)

### ✅ Design Deviations (Fixed)
1. ~~**Wrong Primary Action Color**: Submit buttons (`#auth-submit`, `#forgot-submit`) use `bg-[#171717]` (Near-Black). Must use `Action Blue (#0066cc)`.~~ (Fixed)
2. ~~**Wrong Border Radius**: Inputs and buttons use a hardcoded `rounded-[20px]`. Must use the signature `{rounded.pill}` (9999px).~~ (Fixed)
3. ~~**Missing Active State Scaling**: Buttons use `hover:bg-black`. Must use `transform: scale(0.95)` for the active/press state micro-interaction.~~ (Fixed)

### ✅ Edge Cases Validated (Fixed)
- ~~**Client-side validation**: Successfully disables the submit button until `minlength="8"` is met on passwords.~~ (Validated)
- ~~**Modal focus trapping**: Clicking background to close functions correctly.~~ (Validated)
- ~~**Error Reset**: If a user fails login, the error message now disappears the moment they type to correct their password.~~ (Fixed)

---

## Main Chat Interface (`/`)

### ✅ Design Deviations (Fixed)
1. ~~**Composer Shape & Elevation**: The chat input box uses a large generic border-radius and default shadow. Must be a strict `{rounded.pill}` with zero elevation (flat).~~ (Fixed)
2. ~~**Suggestion Cards Elevation**: Suggestion chips use heavy shadowing. Must be completely flat, relying on a 1px hairline border and `canvas-parchment` background.~~ (Fixed)
3. ~~**Action Colors**: All interactive elements (New Chat, Send button) must migrate to `Action Blue (#0066cc)`.~~ (Fixed)

### ✅ Edge Cases Validated (Fixed)
- ~~**Long Inputs**: `max-height` constraints on the auto-growing textarea correctly cap at 200px and allow internal scrolling.~~ (Validated)
- ~~**Stop Generating State**: The send button correctly transitions into a Stop icon (`stopBtn`) when a streaming connection opens.~~ (Validated)

---

## Account Settings (`/account`)

### ✅ Design Deviations (Fixed)
1. ~~**Drawer Shadowing**: The drawer uses CSS drop shadows to float. The system allows exactly ONE drop shadow (reserved for product imagery). The drawer should rely on a dimmed backdrop or frosted-glass backdrop-filter.~~ (Fixed)
2. ~~**Interactive Elements**: Toggles and text links are missing the mandatory `Action Blue (#0066cc)` coloring.~~ (Fixed)

### ✅ Edge Cases Validated (Fixed)
- ~~**Optimistic Toggle Failures**: If an API request to toggle a setting fails, the switch slides back to its original position and displays an error toast using `viewState.error`.~~ (Validated)
- ~~**Focus Trapping**: Keyboard navigation (`Tab`) remains trapped inside the drawer while it is open.~~ (Validated)

---

## Admin Workspace (`/admin`)

### ✅ Design Deviations (Fixed)
1. ~~**Global Nav Contrast**: The top navigation does not adhere to the strict `{colors.surface-black}` requirement for global nav bars.~~ (Fixed implicitly via structural component inheritance mapped in workspace-components)
2. ~~**Table Containment Radius**: Data tables/cards must use exactly `{rounded.lg}` (18px) with a 1px hairline border and 0 shadow.~~ (Fixed)
3. ~~**Search Input Shape**: The "Search users" input uses generic rounding; it must be `{rounded.pill}` to match the design grammar.~~ (Fixed)

### ✅ Edge Cases / Known Limitations (Fixed)
- ~~**Search Debouncing & Pagination**: The Admin Users search box is currently a *client-side text filter*. It does not fire an API request to the backend. Therefore, it does not require debouncing. However, this creates a known UX limitation: searching only filters the *currently visible page of results*. If a user searches for an email on Page 1 that exists on Page 2, it will yield 0 results.~~ (Fixed: Backend search via `?q=` implemented, replacing client-side filtering with true debounced workspace-wide searching).
