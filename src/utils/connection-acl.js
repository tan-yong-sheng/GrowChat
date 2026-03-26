const MISSING_TABLE_REGEX = /no such table:\s*connection_acl_rules/i;

export function normalizeConnectionAclEffect(value) {
  const effect = String(value || 'allow').trim().toLowerCase();
  return effect === 'deny' ? 'deny' : 'allow';
}

export function normalizeConnectionAclPrincipalType(value) {
  const principalType = String(value || 'group').trim().toLowerCase();
  return principalType === 'user' ? 'user' : 'group';
}

export function normalizeConnectionAclAction(value) {
  const action = String(value || 'use').trim().toLowerCase();
  return action || 'use';
}

export function normalizeConnectionAclRule(rule = {}) {
  const connectionId = String(rule.connection_id || rule.connectionId || '').trim();
  const principalType = normalizeConnectionAclPrincipalType(rule.principal_type || rule.principalType);
  const principalId = String(rule.principal_id || rule.principalId || '').trim();
  const effect = normalizeConnectionAclEffect(rule.effect);
  const action = normalizeConnectionAclAction(rule.action);
  if (!connectionId || !principalId) return null;
  return {
    connection_id: connectionId,
    principal_type: principalType,
    principal_id: principalId,
    effect,
    action,
  };
}

export function buildConnectionAclIndex(rules = []) {
  const index = new Map();
  for (const rule of Array.isArray(rules) ? rules : []) {
    const normalized = normalizeConnectionAclRule(rule);
    if (!normalized) continue;
    if (!index.has(normalized.connection_id)) {
      index.set(normalized.connection_id, []);
    }
    index.get(normalized.connection_id).push(normalized);
  }
  return index;
}

function ruleMatchesPrincipal(rule, userId, userGroupIds) {
  if (!rule) return false;
  if (rule.principal_type === 'user') {
    return String(rule.principal_id || '') === String(userId || '');
  }
  return userGroupIds instanceof Set && userGroupIds.has(String(rule.principal_id || ''));
}

function isConnectionAclActionRelevant(action) {
  const normalized = String(action || 'use').trim().toLowerCase();
  return ['use', 'manage', 'admin', 'read'].includes(normalized);
}

export function evaluateConnectionAclAccess(connection, { user = null, userGroupIds = new Set(), rules = [], allowAdmin = true } = {}) {
  if (connection?.source === 'user') {
    return { allowed: true, access_label: 'Personal', access_variant: 'personal' };
  }

  const normalizedRules = Array.isArray(rules) ? rules.map(normalizeConnectionAclRule).filter(Boolean) : [];
  const denyMatched = normalizedRules.some((rule) => rule.effect === 'deny' && isConnectionAclActionRelevant(rule.action) && ruleMatchesPrincipal(rule, user?.sub, userGroupIds));
  if (denyMatched) {
    return { allowed: false, access_label: 'No access', access_variant: 'none' };
  }

  const allowMatched = normalizedRules.some((rule) => rule.effect === 'allow' && isConnectionAclActionRelevant(rule.action) && ruleMatchesPrincipal(rule, user?.sub, userGroupIds));
  if (allowMatched) {
    return { allowed: true, access_label: 'Shared', access_variant: 'shared' };
  }

  if (allowAdmin && user?.role === 'admin') {
    return { allowed: true, access_label: 'Admin', access_variant: 'admin' };
  }

  return { allowed: false, access_label: 'No access', access_variant: 'none' };
}

export async function ensureConnectionAclRulesTable(db) {
  if (!db) return;
  try {
    await db.run(
      `CREATE TABLE IF NOT EXISTS connection_acl_rules (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
        principal_id TEXT NOT NULL,
        effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
        action TEXT NOT NULL DEFAULT 'use',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(connection_id, principal_type, principal_id, effect, action)
      )`
    );
    await db.run('CREATE INDEX IF NOT EXISTS idx_connection_acl_rules_connection_id ON connection_acl_rules(connection_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_connection_acl_rules_principal ON connection_acl_rules(principal_type, principal_id)');
  } catch (err) {
    console.warn('Failed to ensure connection_acl_rules table:', err?.message || err);
  }
}

function buildIdFilterClause(columnName, ids = []) {
  const values = Array.isArray(ids) ? ids.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!values.length) return null;
  return {
    clause: `${columnName} IN (${values.map(() => '?').join(', ')})`,
    values,
  };
}

export async function loadConnectionAclRules(db, connectionId = null, connectionIds = null) {
  if (!db) return [];
  try {
    await ensureConnectionAclRulesTable(db);
    const idFilter = connectionIds && !connectionId ? buildIdFilterClause('connection_id', connectionIds) : null;
    const singleFilter = connectionId ? { clause: 'connection_id = ?', values: [connectionId] } : null;
    const filter = singleFilter || idFilter;
    const rows = filter
      ? await db.all(
          `SELECT id, connection_id, principal_type, principal_id, effect, action, created_at, updated_at
           FROM connection_acl_rules
           WHERE ${filter.clause}
           ORDER BY connection_id ASC, effect DESC, principal_type ASC, principal_id ASC, action ASC`,
          filter.values
        )
      : await db.all(
          `SELECT id, connection_id, principal_type, principal_id, effect, action, created_at, updated_at
           FROM connection_acl_rules
           ORDER BY connection_id ASC, effect DESC, principal_type ASC, principal_id ASC, action ASC`
        );
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      id: row.id,
      connection_id: row.connection_id,
      principal_type: normalizeConnectionAclPrincipalType(row.principal_type),
      principal_id: String(row.principal_id || '').trim(),
      effect: normalizeConnectionAclEffect(row.effect),
      action: normalizeConnectionAclAction(row.action),
      created_at: row.created_at,
      updated_at: row.updated_at,
    })).filter((row) => row.connection_id && row.principal_id);
  } catch (err) {
    if (MISSING_TABLE_REGEX.test(String(err?.message || ''))) return [];
    throw err;
  }
}

export async function saveConnectionAclRulesForConnection(db, connectionId, rules = []) {
  if (!db || !connectionId) throw new Error('Connection id is required');
  await ensureConnectionAclRulesTable(db);
  const normalized = (Array.isArray(rules) ? rules : [])
    .map((rule) => normalizeConnectionAclRule({ ...rule, connection_id: connectionId }))
    .filter(Boolean);
  await db.run('DELETE FROM connection_acl_rules WHERE connection_id = ?', [connectionId]);
  for (const rule of normalized) {
    await db.run(
      `INSERT INTO connection_acl_rules (id, connection_id, principal_type, principal_id, effect, action, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
      [
        crypto.randomUUID(),
        rule.connection_id,
        rule.principal_type,
        rule.principal_id,
        rule.effect,
        rule.action,
      ]
    );
  }
  return loadConnectionAclRules(db, connectionId);
}
