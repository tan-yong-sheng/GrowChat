# QA Admin Pages - Iteration 17: Bug Analysis & Fix

**Date:** 2026-04-08  
**Status:** Bug Identified & Fix Ready  
**Current UI/UX Score:** 88/100 (Target: 95/100)

---

## Critical Bug Found: Model Toggle State Sync

### Issue Description
When toggling a model off in `/admin/settings/models`, the active model count doesn't update. The toggle switch updates visually, but the count remains unchanged.

### Root Cause
**File:** `public/js/features/admin/settings/models.js`  
**Location:** Line 227 in `syncUi()` function

The active model count is calculated using:
```javascript
const displayTotal = modelsState.activeTotal || countEnabledModels(modelsState.models);
```

This reads from the original `modelsState.models` array, which hasn't been modified. However, the toggle handler optimistically updates `modelsState.disabledModels` (a local Set) on lines 106-110:

```javascript
if (wasDisabled) {
  modelsState.disabledModels.delete(modelId);
} else {
  modelsState.disabledModels.add(modelId);
}
```

The `countEnabledModels()` function doesn't account for this local override, so the count never reflects the optimistic update.

### Impact
- **Severity:** HIGH
- **User Impact:** Confusing UI - toggle works but count doesn't update
- **Scope:** `/admin/settings/models` and My Settings modal Models tab

### Solution
Calculate the active model count considering both the original model data AND the local `disabledModels` overrides:

```javascript
const displayTotal = modelsState.activeTotal || 
  modelsState.models.reduce((count, model) => {
    const isDisabled = modelsState.disabledModels.has(model.id);
    const isEnabled = !isDisabled && model.enabled !== false;
    return count + (isEnabled ? 1 : 0);
  }, 0);
```

---

## Testing Checklist

### Before Fix
- [ ] Toggle a model off
- [ ] Observe: toggle switch changes, but count stays same (BUG)

### After Fix
- [ ] Toggle a model off
- [ ] Observe: toggle switch changes AND count decrements (FIXED)
- [ ] Toggle model back on
- [ ] Observe: count increments back
- [ ] Test with multiple models
- [ ] Verify API call succeeds
- [ ] Verify rollback on API error

---

## Next Steps
1. Apply fix to models.js
2. Test in browser
3. Verify count updates correctly
4. Run /evolve to document pattern
5. Run /autoresearch:learn to capture learnings
