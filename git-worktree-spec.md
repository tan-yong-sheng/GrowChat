# Git Worktree Spec: fix/admin-acl-xss

| Field | Value |
|---|---|
| **Source Reference** | https://github.com/tan-yong-sheng/GrowChat/issues/117, https://github.com/tan-yong-sheng/GrowChat/issues/121 |
| **Branch** | `fix/admin-acl-xss` |
| **Parent** | #72 (quality gates roadmap) |
| **Merge Priority** | **1st — CRITICAL (#117 data-loss) + Security (#121 XSS)** |

## Goal

Fix two high-priority issues in admin settings: the sameAsBase ACL data-loss bug in integrations.js (#117, same pattern as the fixed #70), and XSS vulnerability from unescaped metadata interpolation in admin templates (#121).

## Requirements

### #117 — CRITICAL: ACL data-loss in integrations.js
Exact same bug as #70 (fixed in PR #116): `sameAsBase` passes `null` to `onApply`, causing `saveAclChanges` to wipe all ACL rules for the tool server.

```javascript
// integrations.js ~line 378
await onApply(sameAsBase ? null : cloneAclRules(rules), server);
```

Fix: skip `onApply` entirely when `sameAsBase === true`:
```javascript
if (sameAsBase) {
  // No changes — skip save entirely to avoid wiping ACLs
  return;
}
await onApply(cloneAclRules(rules), server);
```

### #121 — Security: XSS via unescaped metadata in admin templates
Model/connection/server `id`, `name`, and other metadata fields interpolated directly into HTML attributes and text content without escaping. A malicious model name like `<img onerror=alert(1) src=x>` would execute when rendered.

**Affected files:**
- `public/js/features/admin/settings/models.js` — `model.id`, `model.name` in `syncUi()`
- `public/js/features/admin/settings/connections.js` — connection metadata
- `public/js/features/admin/settings/integrations.js` — server metadata

Fix: Use `DOMPurify.sanitize()` or `textContent`/`setAttribute` instead of `innerHTML` interpolation for all user-controlled metadata. Add a shared `escapeHtml()` utility if one doesn't exist.

## Implementation Scope

- [x] `public/js/features/admin/settings/integrations.js` — fix #117: skip onApply when sameAsBase
- [x] `public/js/features/admin/settings/integrations.js` — fix #121: escape server metadata
- [x] `public/js/features/admin/settings/models.js` — fix #121: escape model metadata
- [x] `public/js/features/admin/settings/connections.js` — fix #121: escape connection metadata
- [x] `public/js/shared/utils/dom-escape.js` — `escapeHtml()` utility already exists
- [x] Tests for ACL no-op and XSS escaping

## Acceptance Criteria

1. Toggling tool server ACL rules with no changes is a no-op (no API call, ACLs preserved)
2. Model/connection/server names containing HTML special characters render as text, not as HTML
3. No `innerHTML` interpolation of user-controlled metadata without escaping
4. All existing tests pass

## Technical Constraints

- Follow same fix pattern as PR #116 (which fixed #70 for models.js)
- DOMPurify is already available in the project (CDN import in index.html)
- Prefer `textContent`/`setAttribute` over `innerHTML` + sanitize where possible
- Keep changes minimal — don't refactor surrounding code

## Cross-branch Notes

- **Must merge BEFORE WT3** (eslint-guardrails) — same admin files refactored later
- No overlap with WT10 (model-selector-race) — different file scope
- #69/#70/#71 were fixed in PR #116 but this is a NEW bug (#117) in a DIFFERENT file
