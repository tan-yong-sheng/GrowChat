# GrowChat D1 Reset And Migration Refactor

## Goal
Delete the existing remote and local D1 databases, then rebuild the schema from a clean migration baseline with no backward-compatibility support.

## Why
The current D1 state has drifted from the migration chain. That makes `wrangler d1 migrations apply` unreliable on existing databases. Since backward compatibility is not required, the clean path is a hard reset plus a fresh migration history.

## Target State
- Fresh local D1 and fresh remote D1
- A migration chain that applies cleanly to an empty database
- No schema compatibility shim
- No legacy KB / Vectorize tables, columns, or permissions
- No replay of old, drifted DB state

## Plan
1. Freeze the current schema surface.
   - Inventory the tables and columns used by the live codebase.
   - Confirm the final schema shape the app actually needs.
   - Keep only the tables that current code paths still reference.

2. Rebuild migrations for a clean start.
   - Collapse the live schema into a fresh baseline migration set.
   - Prefer one canonical initial migration if that keeps the chain simpler.
   - Remove old migration files from the execution path once the baseline exists.
   - Keep only forward-only migrations after the baseline.

3. Reset both D1 databases.
   - Delete the existing remote database.
   - Delete the local persisted database state.
   - Recreate both under the same binding name if possible.
   - Update `wrangler.jsonc` with the new database IDs.

4. Apply migrations to both environments.
   - Run migrations locally first.
   - Run migrations remotely next.
   - Verify the new schema matches the current app expectations.

5. Remove compatibility code.
   - Delete schema-compatibility bootstrapping.
   - Remove migration-gap assumptions that no longer fit the new chain.
   - Remove any code that exists only to tolerate old DB shapes.

## ASCII Flow
```
current codebase
      |
      v
fresh migration baseline
      |
      +--> local D1 (new)
      |
      +--> remote D1 (new)
      |
      v
smoke tests + schema verification
```

## Success Criteria
- `wrangler d1 migrations apply` succeeds on both local and remote
- No KB / Vectorize tables or permissions exist in either database
- No compatibility code remains in the worker bootstrap
- The database state is entirely migration-driven

## Notes
- This plan assumes the current remote and local D1 databases are disposable.
- This plan does not preserve old data.
- This plan intentionally ignores backward compatibility.
