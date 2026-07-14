import { buildIdFilterClause, evaluateAclAccess } from './acl-shared.js';
import { createRootLogger } from './logger.js';
const logger = createRootLogger({});

const MISSING_TABLE_REGEX = /no such table:\s*model_acl_rules/i;

function safeDecodeResourceId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function expandModelAclResourceIds(ids = []) {
  const values = Array.isArray(ids) ? ids : [];
  const expanded = [];
  const seen = new Set();
  for (const value of values) {
    const canonical = safeDecodeResourceId(value);
    for (const candidate of [canonical, encodeURIComponent(canonical)]) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      expanded.push(candidate);
    }
  }
  return expanded;
}

export function normalizeModelAclEffect(value) {
  const effect = String(value || 'allow')
    .trim()
    .toLowerCase();
  return effect === 'deny' ? 'deny' : 'allow';
}

export function normalizeModelAclPrincipalType(value) {
  const principalType = String(value || 'group')
    .trim()
    .toLowerCase();
  return principalType === 'user' ? 'user' : 'group';
}

export function normalizeModelAclAction(value) {
  const action = String(value || 'use')
    .trim()
    .toLowerCase();
  return action || 'use';
}

export function normalizeModelAclRule(rule = {}) {
  const modelId = String(rule.model_id || rule.modelId || '').trim();
  const principalType = normalizeModelAclPrincipalType(rule.principal_type || rule.principalType);
  const principalId = String(rule.principal_id || rule.principalId || '').trim();
  const effect = normalizeModelAclEffect(rule.effect);
  const action = normalizeModelAclAction(rule.action);
  if (!modelId || !principalId) return null;
  return {
    model_id: modelId,
    principal_type: principalType,
    principal_id: principalId,
    effect,
    action,
  };
}

export function buildModelAclIndex(rules = []) {
  const index = new Map();
  for (const rule of Array.isArray(rules) ? rules : []) {
    const normalized = normalizeModelAclRule(rule);
    if (!normalized) continue;
    if (!index.has(normalized.model_id)) {
      index.set(normalized.model_id, []);
    }
    index.get(normalized.model_id).push(normalized);
  }
  return index;
}

export function evaluateModelAclAccess(
  model,
  { user = null, userGroupIds = new Set(), rules = [], allowAdmin = true } = {}
) {
  return evaluateAclAccess({
    resource: model,
    rules,
    normalizeRule: normalizeModelAclRule,
    user,
    userGroupIds,
    allowAdmin,
    isPersonal: (resource) => resource?.connection_source === 'user',
  });
}

export async function ensureModelAclRulesTable(db) {
  if (!db) return;
  try {
    await db.run(
      `CREATE TABLE IF NOT EXISTS model_acl_rules (
        id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL,
        principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
        principal_id TEXT NOT NULL,
        effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
        action TEXT NOT NULL DEFAULT 'use',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(model_id, principal_type, principal_id, effect, action)
      )`
    );
    await db.run(
      'CREATE INDEX IF NOT EXISTS idx_model_acl_rules_model_id ON model_acl_rules(model_id)'
    );
    await db.run(
      'CREATE INDEX IF NOT EXISTS idx_model_acl_rules_principal ON model_acl_rules(principal_type, principal_id)'
    );
  } catch (err) {
    logger.warn('Failed to ensure model_acl_rules table', { error: err?.message || err });
  }
}

function normalizeModelAclRules(canonicalModelId, rules) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule) => normalizeModelAclRule({ ...rule, model_id: canonicalModelId }))
    .filter(Boolean);
}

function buildModelAclSchemaStatements(db) {
  return [
    db.prepare(
      `CREATE TABLE IF NOT EXISTS model_acl_rules (
        id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL,
        principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
        principal_id TEXT NOT NULL,
        effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
        action TEXT NOT NULL DEFAULT 'use',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(model_id, principal_type, principal_id, effect, action)
      )`
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_model_acl_rules_model_id ON model_acl_rules(model_id)'
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_model_acl_rules_principal ON model_acl_rules(principal_type, principal_id)'
    ),
  ];
}

function buildModelAclDeleteStatement(db, deleteIds) {
  return db.prepare(
    `DELETE FROM model_acl_rules WHERE model_id IN (${deleteIds.map(() => '?').join(', ')})`,
    deleteIds
  );
}

function buildModelAclInsertStatement(db, canonicalModelId, rule) {
  return db.prepare(
    `INSERT INTO model_acl_rules (id, model_id, principal_type, principal_id, effect, action, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
    [
      crypto.randomUUID(),
      canonicalModelId,
      rule.principal_type,
      rule.principal_id,
      rule.effect,
      rule.action,
    ]
  );
}

export function buildModelAclRuleSaveStatements(
  db,
  modelId,
  rules = [],
  { includeSchemaStatements = true } = {}
) {
  if (!db || !modelId) throw new Error('Model id is required');
  const canonicalModelId = safeDecodeResourceId(modelId);
  const normalized = normalizeModelAclRules(canonicalModelId, rules);
  const deleteIds = expandModelAclResourceIds([canonicalModelId]);
  const statements = includeSchemaStatements ? buildModelAclSchemaStatements(db) : [];
  if (deleteIds.length) {
    statements.push(buildModelAclDeleteStatement(db, deleteIds));
  }
  for (const rule of normalized) {
    statements.push(buildModelAclInsertStatement(db, canonicalModelId, rule));
  }
  return { canonicalModelId, normalized, statements };
}

function buildModelAclFilter(modelId, modelIds) {
  const canonicalModelId = modelId != null ? safeDecodeResourceId(modelId) : null;
  if (canonicalModelId) {
    return buildIdFilterClause('model_id', [canonicalModelId]);
  }
  const canonicalModelIds =
    modelIds && canonicalModelId == null ? expandModelAclResourceIds(modelIds) : null;
  return canonicalModelIds ? buildIdFilterClause('model_id', canonicalModelIds) : null;
}

function normalizeModelAclRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: row.id,
      model_id: safeDecodeResourceId(row.model_id),
      principal_type: normalizeModelAclPrincipalType(row.principal_type),
      principal_id: String(row.principal_id || '').trim(),
      effect: normalizeModelAclEffect(row.effect),
      action: normalizeModelAclAction(row.action),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
    .filter((row) => row.model_id && row.principal_id)
    .reduce(
      (acc, row) => {
        const key = `${row.model_id}:${row.principal_type}:${row.principal_id}:${row.effect}:${row.action}`;
        if (acc.seen.has(key)) return acc;
        acc.seen.add(key);
        acc.items.push(row);
        return acc;
      },
      { seen: new Set(), items: [] }
    ).items;
}

export async function loadModelAclRules(db, modelId = null, modelIds = null) {
  if (!db) return [];
  try {
    await ensureModelAclRulesTable(db);
    const filter = buildModelAclFilter(modelId, modelIds);
    const rows = filter
      ? await db.all(
          `SELECT id, model_id, principal_type, principal_id, effect, action, created_at, updated_at
           FROM model_acl_rules
           WHERE ${filter.clause}
           ORDER BY model_id ASC, effect DESC, principal_type ASC, principal_id ASC, action ASC`,
          filter.values
        )
      : await db.all(
          `SELECT id, model_id, principal_type, principal_id, effect, action, created_at, updated_at
           FROM model_acl_rules
           ORDER BY model_id ASC, effect DESC, principal_type ASC, principal_id ASC, action ASC`
        );
    return normalizeModelAclRows(rows);
  } catch (err) {
    if (MISSING_TABLE_REGEX.test(String(err?.message || ''))) return [];
    throw err;
  }
}

export async function saveModelAclRulesForModel(db, modelId, rules = []) {
  const { statements } = buildModelAclRuleSaveStatements(db, modelId, rules);
  await db.batch(statements);
  return loadModelAclRules(db, modelId);
}
