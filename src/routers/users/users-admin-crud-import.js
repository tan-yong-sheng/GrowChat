import { createDB } from '../../db.js';
import { hashPassword } from '../../shared/auth.js';
import { authorize, logAuditEvent } from '../../utils/authorize.js';
import { authError, error, json } from '../../utils/response.js';
import { isValidEmail } from '../../validation/request.js';
import {
  normalizeAccountStatus,
  resolveRequestedRole,
  syncGlobalRoleBinding,
} from './users-helpers.js';

export async function handleImportUsers(req, env, user, logger) {
  const authDecision = await authorize(env, user, {
    action: 'admin.user.write',
    resource: 'users',
  });

  if (!authDecision.allow) {
    return authError(req, authDecision);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }

  const csv = String(body.csv || '');
  if (!csv.trim()) {
    return error(req, 'csv is required', 400);
  }

  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length === 0) {
    return error(req, 'CSV is empty', 400);
  }

  const db = createDB(env.DB);
  const results = [];
  let created = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const line = rows[index];
    const rowResult = await processImportRow({
      req,
      db,
      env,
      line,
      index,
      userId: user.sub,
      logger,
    });
    if (rowResult.skipped) continue;
    results.push(rowResult.entry);
    if (rowResult.entry.ok) created += 1;
  }

  await logAuditEvent(env, {
    actor_id: user.sub,
    action: 'user_imported',
    resource_type: 'users',
    resource_id: null,
    metadata: { created, attempted: results.length },
  });

  return json(
    req,
    {
      ok: true,
      created,
      results,
    },
    201
  );
}

async function processImportRow({ db, env, line, index, userId, logger }) {
  const rowNumber = index + 1;

  if (index === 0 && /^name\s*,\s*email\s*,\s*password\s*,\s*primary_role$/i.test(line)) {
    return { skipped: true };
  }

  const [name, emailRaw, password, roleRaw, accountStatusRaw] = line
    .split(',')
    .map((value) => value.trim());
  const email = String(emailRaw || '').toLowerCase();
  const requestedRole = String(roleRaw || 'member').toLowerCase();
  const role = await resolveRequestedRole(db, requestedRole);
  const accountStatus = normalizeAccountStatus(accountStatusRaw, 'active');

  const validation = validateImportRow({
    name,
    email,
    password,
    requestedRole,
    role,
    rowNumber,
  });
  if (validation.error) {
    return { entry: { row: rowNumber, ok: false, error: validation.error } };
  }

  const existing = await db.first('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    return { entry: { row: rowNumber, ok: false, error: 'Email already registered' } };
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await db.run(
    `INSERT INTO users (
      id, email, password_hash, name, account_status, settings, preferences,
      created_at, updated_at, last_active_at
    ) VALUES (?, ?, ?, ?, ?, '{}', '{}', unixepoch(), unixepoch(), unixepoch())`,
    [id, email, passwordHash, name, accountStatus]
  );
  await syncGlobalRoleBinding(db, id, role, accountStatus, logger);
  return {
    entry: {
      row: rowNumber,
      ok: true,
      email,
      primary_role: role,
      account_status: accountStatus,
    },
  };
}

function validateImportRow({ name, email, password, requestedRole, role, rowNumber }) {
  if (!name || !email || !password || !requestedRole) {
    return { error: 'Each row must include name, email, password, primary_role' };
  }

  if (!isValidEmail(email)) {
    return { error: 'Invalid email format' };
  }

  if (!role) {
    return { error: 'primary_role must match an existing role' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }

  return {};
}
