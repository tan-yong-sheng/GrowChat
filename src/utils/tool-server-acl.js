const MISSING_TABLE_REGEX = /no such table:\s*tool_server_acl_rules/i;

export function normalizeToolServerAclEffect(value) {
  const effect = String(value || 'allow')
    .trim()
    .toLowerCase();
  return effect === 'deny' ? 'deny' : 'allow';
}

export function normalizeToolServerAclPrincipalType(value) {
  const principalType = String(value || 'group')
    .trim()
    .toLowerCase();
  return principalType === 'user' ? 'user' : 'group';
}

export function normalizeToolServerAclAction(value) {
  const action = String(value || 'use')
    .trim()
    .toLowerCase();
  return action || 'use';
}

export function normalizeToolServerAclRule(rule = {}) {
  const toolServerId = String(rule.tool_server_id || rule.toolServerId || '').trim();
  const principalType = normalizeToolServerAclPrincipalType(
    rule.principal_type || rule.principalType
  );
  const principalId = String(rule.principal_id || rule.principalId || '').trim();
  const effect = normalizeToolServerAclEffect(rule.effect);
  const action = normalizeToolServerAclAction(rule.action);
  if (!toolServerId || !principalId) return null;
  return {
    tool_server_id: toolServerId,
    principal_type: principalType,
    principal_id: principalId,
    effect,
    action,
  };
}

export function buildToolServerAclIndex(rules = []) {
  const index = new Map();
  for (const rule of Array.isArray(rules) ? rules : []) {
    const normalized = normalizeToolServerAclRule(rule);
    if (!normalized) continue;
    if (!index.has(normalized.tool_server_id)) {
      index.set(normalized.tool_server_id, []);
    }
    index.get(normalized.tool_server_id).push(normalized);
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

function isToolServerAclActionRelevant(action) {
  const normalized = String(action || 'use')
    .trim()
    .toLowerCase();
  return ['use', 'manage', 'admin', 'read'].includes(normalized);
}

export function evaluateToolServerAclAccess(
  toolServer,
  { user = null, userGroupIds = new Set(), rules = [], allowAdmin = true } = {}
) {
  if (toolServer?.source === 'user') {
    return { allowed: true, access_label: 'Personal', access_variant: 'personal' };
  }

  const normalizedRules = Array.isArray(rules)
    ? rules.map(normalizeToolServerAclRule).filter(Boolean)
    : [];
  const denyMatched = normalizedRules.some(
    (rule) =>
      rule.effect === 'deny' &&
      isToolServerAclActionRelevant(rule.action) &&
      ruleMatchesPrincipal(rule, user?.sub, userGroupIds)
  );
  if (denyMatched) {
    return { allowed: false, access_label: 'No access', access_variant: 'none' };
  }

  const allowMatched = normalizedRules.some(
    (rule) =>
      rule.effect === 'allow' &&
      isToolServerAclActionRelevant(rule.action) &&
      ruleMatchesPrincipal(rule, user?.sub, userGroupIds)
  );
  if (allowMatched) {
    return { allowed: true, access_label: 'Shared', access_variant: 'shared' };
  }

  if (allowAdmin && user?.primary_role === 'admin') {
    return { allowed: true, access_label: 'Admin', access_variant: 'admin' };
  }

  return { allowed: false, access_label: 'No access', access_variant: 'none' };
}

export async function ensureToolServerAclRulesTable(db) {
  if (!db) return;
  try {
    await db.run(
      `CREATE TABLE IF NOT EXISTS tool_server_acl_rules (
        id TEXT PRIMARY KEY,
        tool_server_id TEXT NOT NULL,
        principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
        principal_id TEXT NOT NULL,
        effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
        action TEXT NOT NULL DEFAULT 'use',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(tool_server_id, principal_type, principal_id, effect, action)
      )`
    );
    await db.run(
      'CREATE INDEX IF NOT EXISTS idx_tool_server_acl_rules_tool_server_id ON tool_server_acl_rules(tool_server_id)'
    );
    await db.run(
      'CREATE INDEX IF NOT EXISTS idx_tool_server_acl_rules_principal ON tool_server_acl_rules(principal_type, principal_id)'
    );
  } catch (err) {
    console.warn('Failed to ensure tool_server_acl_rules table:', err?.message || err);
  }
}

export function buildToolServerAclRuleSaveStatements(
  db,
  toolServerId,
  rules = [],
  { includeSchemaStatements = true } = {}
) {
  if (!db || !toolServerId) throw new Error('Tool server id is required');
  const normalized = (Array.isArray(rules) ? rules : [])
    .map((rule) => normalizeToolServerAclRule({ ...rule, tool_server_id: toolServerId }))
    .filter(Boolean);
  const statements = [];
  if (includeSchemaStatements) {
    statements.push(
      db.prepare(
        `CREATE TABLE IF NOT EXISTS tool_server_acl_rules (
          id TEXT PRIMARY KEY,
          tool_server_id TEXT NOT NULL,
          principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
          principal_id TEXT NOT NULL,
          effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
          action TEXT NOT NULL DEFAULT 'use',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(tool_server_id, principal_type, principal_id, effect, action)
        )`
      ),
      db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_tool_server_acl_rules_tool_server_id ON tool_server_acl_rules(tool_server_id)'
      ),
      db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_tool_server_acl_rules_principal ON tool_server_acl_rules(principal_type, principal_id)'
      )
    );
  }
  statements.push(
    db.prepare('DELETE FROM tool_server_acl_rules WHERE tool_server_id = ?', [toolServerId])
  );
  for (const rule of normalized) {
    statements.push(
      db.prepare(
        `INSERT INTO tool_server_acl_rules (id, tool_server_id, principal_type, principal_id, effect, action, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
        [
          crypto.randomUUID(),
          rule.tool_server_id,
          rule.principal_type,
          rule.principal_id,
          rule.effect,
          rule.action,
        ]
      )
    );
  }
  return { normalized, statements };
}

function buildIdFilterClause(columnName, ids = []) {
  const values = Array.isArray(ids) ? ids.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!values.length) return null;
  return {
    clause: `${columnName} IN (${values.map(() => '?').join(', ')})`,
    values,
  };
}

export async function loadToolServerAclRules(db, toolServerId = null, toolServerIds = null) {
  if (!db) return [];
  try {
    await ensureToolServerAclRulesTable(db);
    const idFilter =
      toolServerIds && !toolServerId ? buildIdFilterClause('tool_server_id', toolServerIds) : null;
    const singleFilter = toolServerId
      ? { clause: 'tool_server_id = ?', values: [toolServerId] }
      : null;
    const filter = singleFilter || idFilter;
    const rows = filter
      ? await db.all(
          `SELECT id, tool_server_id, principal_type, principal_id, effect, action, created_at, updated_at
           FROM tool_server_acl_rules
           WHERE ${filter.clause}
           ORDER BY tool_server_id ASC, effect DESC, principal_type ASC, principal_id ASC, action ASC`,
          filter.values
        )
      : await db.all(
          `SELECT id, tool_server_id, principal_type, principal_id, effect, action, created_at, updated_at
           FROM tool_server_acl_rules
           ORDER BY tool_server_id ASC, effect DESC, principal_type ASC, principal_id ASC, action ASC`
        );
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        id: row.id,
        tool_server_id: row.tool_server_id,
        principal_type: normalizeToolServerAclPrincipalType(row.principal_type),
        principal_id: String(row.principal_id || '').trim(),
        effect: normalizeToolServerAclEffect(row.effect),
        action: normalizeToolServerAclAction(row.action),
        created_at: row.created_at,
        updated_at: row.updated_at,
      }))
      .filter((row) => row.tool_server_id && row.principal_id);
  } catch (err) {
    if (MISSING_TABLE_REGEX.test(String(err?.message || ''))) return [];
    throw err;
  }
}

export async function saveToolServerAclRulesForToolServer(db, toolServerId, rules = []) {
  const { statements } = buildToolServerAclRuleSaveStatements(db, toolServerId, rules);
  await db.batch(statements);
  return loadToolServerAclRules(db, toolServerId);
}
