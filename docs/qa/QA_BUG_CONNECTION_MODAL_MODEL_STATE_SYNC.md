# QA Bug Report: Connection Modal Model State Sync Issue

**Date:** 2026-04-08 18:26 CST  
**Severity:** HIGH  
**Status:** Identified - Awaiting Fix  
**Related:** Model toggle state sync bug (FIXED in iteration 17)

---

## Issue Description

When editing a connection in `/admin/settings/connections`, the modal displays "Models enabled in this connection: X of Y" but this count does NOT reflect the global model enabled/disabled state from `/admin/settings/models`.

### Expected Behavior
- Connection modal should show ALL available models (not just connection-specific models)
- Model selection should reflect global enabled/disabled state
- Toggling models in connection modal should update the global model state
- Count should match the active model count from `/admin/settings/models`

### Actual Behavior
- Connection modal loads models filtered by `connection_id` (line 746 in connections.js)
- Only shows models assigned to that specific connection
- Status shows "Models enabled in this connection" (connection-specific, not global)
- Selecting models in connection modal doesn't affect global model state

---

## Root Cause Analysis

### File: `public/js/features/admin/settings/connections.js`

**Line 746 - Model Filtering:**
```javascript
const filtered = allModels.filter((model) => String(model?.connection_id || '') === connectionId);
```

This filters models to only those belonging to the connection, creating a disconnect between:
1. **Global model state** - managed in `/admin/settings/models` (enabled/disabled for all connections)
2. **Connection-specific model selection** - managed in connection modal (which models this connection uses)

### Architecture Issue

The connection modal is designed to manage **connection-specific** model assignments, not **global** model state. However, the UI suggests it's managing global state by:
- Showing a count of "Models enabled in this connection"
- Not clearly distinguishing between global and connection-specific state
- Not reflecting changes from the models page

---

## Impact

- Users expect model selection in connection modal to reflect global model state
- Model count doesn't sync across pages
- Confusing UX: toggling models in one place doesn't affect another

---

## Recommended Fix

### Option 1: Show All Models (Recommended)
- Load ALL models (not filtered by connection_id)
- Display global enabled/disabled state
- Allow users to select which models this connection supports
- Update status to show "Models available globally: X of Y"

### Option 2: Clarify Connection-Specific State
- Keep current filtering behavior
- Update UI labels to clearly indicate "connection-specific" state
- Add note explaining this is separate from global model state
- Link to `/admin/settings/models` for global state management

### Option 3: Sync Global State
- When user toggles models in connection modal, update global model state
- Requires API changes to support model enable/disable from connection modal

---

## Files to Modify

- `public/js/features/admin/settings/connections.js` - loadModalModels() function
- `public/js/shared/components/connection-modal.js` - modal markup/status display
- API endpoint `/api/admin/models` - may need to support filtering by connection

---

## Testing Checklist

- [ ] Open connection modal
- [ ] Verify models shown match global model list
- [ ] Verify model count reflects global enabled/disabled state
- [ ] Toggle models in connection modal
- [ ] Verify changes sync to `/admin/settings/models`
- [ ] Verify changes sync to chat page model dropdown
- [ ] Test with multiple connections

---

## Related Issues

- Model toggle state sync bug (FIXED - commit d83a418)
- Modal pointer-events fix (FIXED - iteration 16)
- Form validation error display (TODO - iteration 17)
