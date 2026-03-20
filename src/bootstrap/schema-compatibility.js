const REQUIRED_RBAC_TABLES = ['roles', 'permissions', 'role_permissions', 'user_roles', 'audit_log'];
const REQUIRED_CORE_TABLES = ['users', 'chats', 'messages', 'refresh_tokens'];

let schemaCompatibilityReady = null;
let schemaDiagnosticsLogged = false;
let coreSchemaDiagnosticsLogged = false;

function isDuplicateColumnError(err) {
  const message = String(err?.message || '');
  return /duplicate column name|already exists/i.test(message);
}

export function resetSchemaCompatibilityState() {
  schemaCompatibilityReady = null;
  schemaDiagnosticsLogged = false;
  coreSchemaDiagnosticsLogged = false;
}

export async function ensureSchemaCompatibility(env) {
  if (schemaCompatibilityReady) return schemaCompatibilityReady;

  schemaCompatibilityReady = (async () => {
    try {
      let info;
      try {
        info = await env.DB.prepare('PRAGMA table_info(messages)').all();
      } catch (err) {
        console.warn('Could not check messages table info:', String(err?.message || err));
        return;
      }
      const columns = info?.results || [];

      if (columns.length) {
        const hasCitations = columns.some((col) => col?.name === 'citations');
        if (!hasCitations) {
          try {
            await env.DB.prepare('ALTER TABLE messages ADD COLUMN citations TEXT').run();
          } catch (err) {
            if (!isDuplicateColumnError(err)) {
              console.warn('Could not add citations column:', String(err?.message || err));
            }
          }
        }
      }

      try {
        const userInfo = await env.DB.prepare('PRAGMA table_info(users)').all();
        const userColumns = userInfo?.results || [];
        if (userColumns.length) {
          const columnNames = new Set(userColumns.map((col) => col?.name).filter(Boolean));

          const columnsToAdd = [
            { name: 'last_active_at', type: 'INTEGER' },
            { name: 'avatar', type: 'TEXT' },
            { name: 'avatar_emoji', type: 'TEXT' },
            { name: 'status', sql: "TEXT DEFAULT 'offline'" },
            { name: 'preferences', sql: "TEXT DEFAULT '{}'" },
          ];

          for (const col of columnsToAdd) {
            if (!columnNames.has(col.name)) {
              try {
                const colDef = col.sql || col.type;
                await env.DB.prepare(`ALTER TABLE users ADD COLUMN ${col.name} ${colDef}`).run();
              } catch (err) {
                if (!isDuplicateColumnError(err)) {
                  console.warn(`Could not add ${col.name} column:`, String(err?.message || err));
                }
              }
            }
          }

          try {
            await env.DB.prepare('UPDATE users SET last_active_at = COALESCE(updated_at, created_at) WHERE last_active_at IS NULL').run();
          } catch {
            // Ignore errors updating defaults.
          }
          try {
            await env.DB.prepare("UPDATE users SET status = 'offline' WHERE status IS NULL").run();
          } catch {
            // Ignore errors updating defaults.
          }
          try {
            await env.DB.prepare("UPDATE users SET preferences = '{}' WHERE preferences IS NULL").run();
          } catch {
            // Ignore errors updating defaults.
          }
        }
      } catch (err) {
        console.warn('Could not check users table schema:', String(err?.message || err));
      }

      try {
        const corePlaceholders = REQUIRED_CORE_TABLES.map(() => '?').join(', ');
        let coreRows;
        try {
          coreRows = await env.DB.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${corePlaceholders})`
          ).bind(...REQUIRED_CORE_TABLES).all();
        } catch (err) {
          console.warn('Could not query core tables:', String(err?.message || err));
          return;
        }

        const coreSet = new Set((coreRows?.results || []).map((row) => row.name));
        const missingCore = REQUIRED_CORE_TABLES.filter((name) => !coreSet.has(name));
        if (missingCore.length > 0 && !coreSchemaDiagnosticsLogged) {
          console.warn(
            `Core schema missing tables [${missingCore.join(', ')}]. ` +
            `Run: wrangler d1 execute growchat --local --file=./migrations/001_initial.sql`
          );
          coreSchemaDiagnosticsLogged = true;
        }

        const placeholders = REQUIRED_RBAC_TABLES.map(() => '?').join(', ');
        let existingRows;
        try {
          existingRows = await env.DB.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
          ).bind(...REQUIRED_RBAC_TABLES).all();
        } catch (err) {
          console.warn('Could not query RBAC tables:', String(err?.message || err));
          return;
        }

        const existingSet = new Set((existingRows?.results || []).map((row) => row.name));
        const missingTables = REQUIRED_RBAC_TABLES.filter((name) => !existingSet.has(name));
        if (missingTables.length > 0 && !schemaDiagnosticsLogged) {
          console.warn(
            `RBAC schema missing tables [${missingTables.join(', ')}]. ` +
            `Run: wrangler d1 execute growchat --local --file=./migrations/010_rbac_core.sql`
          );
          schemaDiagnosticsLogged = true;
        }
      } catch (err) {
        console.warn('Schema diagnostics failed:', String(err?.message || err));
      }

      schemaDiagnosticsLogged = true;
    } catch (err) {
      console.warn('Schema compatibility check failed:', String(err?.message || err));
    }
  })();

  try {
    await schemaCompatibilityReady;
  } catch (err) {
    schemaCompatibilityReady = null;
    throw err;
  }

  return schemaCompatibilityReady;
}
