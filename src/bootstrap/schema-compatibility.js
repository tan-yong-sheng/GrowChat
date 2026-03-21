const REQUIRED_RBAC_TABLES = ['roles', 'permissions', 'role_permissions', 'user_roles', 'audit_log'];
const REQUIRED_CORE_TABLES = ['users', 'chats', 'messages', 'refresh_tokens'];

let schemaCompatibilityReady = null;
let schemaDiagnosticsLogged = false;
let coreSchemaDiagnosticsLogged = false;

function isDuplicateColumnError(err) {
  const message = String(err?.message || '');
  return /duplicate column name|already exists/i.test(message);
}

function warn(message, err) {
  console.warn(message, String(err?.message || err));
}

async function readTableColumns(env, tableName, label) {
  try {
    const info = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
    return info?.results || [];
  } catch (err) {
    warn(`Could not check ${label} table info:`, err);
    return null;
  }
}

async function ensureMissingColumns(env, tableName, columns) {
  for (const column of columns) {
    try {
      const colDef = column.sql || column.type;
      await env.DB.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${colDef}`).run();
    } catch (err) {
      if (!isDuplicateColumnError(err)) {
        warn(`Could not add ${column.name} column:`, err);
      }
    }
  }
}

async function runBestEffort(env, sql) {
  try {
    await env.DB.prepare(sql).run();
  } catch {
    // Ignore errors updating defaults.
  }
}

async function readExistingTables(env, requiredTables, label) {
  const placeholders = requiredTables.map(() => '?').join(', ');
  try {
    const rows = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
    ).bind(...requiredTables).all();
    return new Set((rows?.results || []).map((row) => row.name));
  } catch (err) {
    warn(`Could not query ${label} tables:`, err);
    return null;
  }
}

function logMissingTables(missingTables, label, migrationPath, alreadyLogged) {
  if (missingTables.length === 0 || alreadyLogged) return false;
  console.warn(
    `${label} missing tables [${missingTables.join(', ')}]. ` +
    `Run: wrangler d1 execute growchat --local --file=${migrationPath}`
  );
  return true;
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
      const columns = await readTableColumns(env, 'messages', 'messages');
      if (columns === null) return;

      if (columns.length) {
        const hasCitations = columns.some((col) => col?.name === 'citations');
        if (!hasCitations) {
          await ensureMissingColumns(env, 'messages', [{ name: 'citations', type: 'TEXT' }]);
        }
      }

      const userColumns = await readTableColumns(env, 'users', 'users');
      if (userColumns && userColumns.length) {
        const columnNames = new Set(userColumns.map((col) => col?.name).filter(Boolean));
        const columnsToAdd = [
          { name: 'last_active_at', type: 'INTEGER' },
          { name: 'avatar', type: 'TEXT' },
          { name: 'avatar_emoji', type: 'TEXT' },
          { name: 'status', sql: "TEXT DEFAULT 'offline'" },
          { name: 'preferences', sql: "TEXT DEFAULT '{}'" },
        ];

        await ensureMissingColumns(
          env,
          'users',
          columnsToAdd.filter((column) => !columnNames.has(column.name))
        );

        await runBestEffort(
          env,
          'UPDATE users SET last_active_at = COALESCE(updated_at, created_at) WHERE last_active_at IS NULL'
        );
        await runBestEffort(env, "UPDATE users SET status = 'offline' WHERE status IS NULL");
        await runBestEffort(env, "UPDATE users SET preferences = '{}' WHERE preferences IS NULL");
      }

      const coreTables = await readExistingTables(env, REQUIRED_CORE_TABLES, 'core');
      if (coreTables) {
        if (logMissingTables(
          REQUIRED_CORE_TABLES.filter((name) => !coreTables.has(name)),
          'Core schema',
          './migrations/001_initial.sql',
          coreSchemaDiagnosticsLogged
        )) {
          coreSchemaDiagnosticsLogged = true;
        }
      }

      const rbacTables = await readExistingTables(env, REQUIRED_RBAC_TABLES, 'RBAC');
      if (rbacTables) {
        if (logMissingTables(
          REQUIRED_RBAC_TABLES.filter((name) => !rbacTables.has(name)),
          'RBAC schema',
          './migrations/010_rbac_core.sql',
          schemaDiagnosticsLogged
        )) {
          schemaDiagnosticsLogged = true;
        }
      }

      schemaDiagnosticsLogged = true;
    } catch (err) {
      warn('Schema compatibility check failed:', err);
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
