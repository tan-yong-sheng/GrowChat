import { createDB } from '../../db.js';
import { ValidationError } from '../../errors/http-errors.js';
import { hashPassword } from '../../shared/auth.js';
import { authorize, logAuditEvent } from '../../utils/authorize.js';
import { authError, error, json } from '../../utils/response.js';
import { requireString, validateEmail } from '../../validation/request.js';
import {
  normalizeAccountStatus,
  resolveRequestedRole,
  syncGlobalRoleBinding,
  parseSettings,
} from './users-helpers.js';

export async function handleCreateUser(req, env, user, logger) {
  const authDecision = await authorize(env, user, {
    action: 'admin.user.write',
    resource: 'users',
  });

  if (!authDecision.allow) {
    return authError(req, authDecision);
  }

  const db = createDB(env.DB);

  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }

  let email;
  let name;
  let password;
  try {
    email = validateEmail(
      requireString(body.email, 'email, name, and password are required').toLowerCase()
    );
    name = requireString(body.name, 'email, name, and password are required');
    password = requireString(body.password, 'email, name, and password are required', {
      trim: false,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(req, err.message, 400);
    }
    throw err;
  }
  const requestedRole = String(body.primary_role || 'member').trim();
  const role = await resolveRequestedRole(db, requestedRole);
  const accountStatus = normalizeAccountStatus(body.account_status, 'active');

  if (password.length < 8) {
    return error(req, 'Password must be at least 8 characters', 400);
  }

  if (!role) {
    return error(req, 'primary_role must match an existing role', 400);
  }

  const existing = await db.first('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    return error(req, 'Email already registered', 409);
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

  const createdUser = await db.first(
    'SELECT id, email, name, account_status, settings, created_at, updated_at, last_active_at FROM users WHERE id = ?',
    [id]
  );

  await logAuditEvent(env, {
    actor_id: user.sub,
    action: 'user_created',
    resource_type: 'user',
    resource_id: id,
    metadata: { email, primary_role: role },
  });

  return json(
    req,
    {
      user: {
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        primary_role: role,
        account_status: normalizeAccountStatus(createdUser.account_status, accountStatus),
        settings: parseSettings(createdUser.settings),
        created_at: createdUser.created_at,
        updated_at: createdUser.updated_at,
        last_active_at: createdUser.last_active_at || null,
      },
    },
    201
  );
}
