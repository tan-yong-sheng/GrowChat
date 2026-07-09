import { createDB } from '../../db.js';
import { ValidationError } from '../../errors/http-errors.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
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

const MIN_PASSWORD_LENGTH = 8;

export async function handleCreateUser(req, env, user, logger) {
  const authDecision = await authorize(env, user, {
    action: 'admin.user.write',
    resource: 'users',
  });
  if (!authDecision.allow) {
    return authError(req, authDecision);
  }

  const db = createDB(env.DB);
  const bodyResult = await readJsonBody(req);
  if (bodyResult.error) return bodyResult.error;

  const input = await validateCreateUserInput(db, req, bodyResult.body);
  if (input.error) return input.error;

  const { email, name, password, role, accountStatus } = input;
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await insertUser(db, { id, email, passwordHash, name, accountStatus });
  await syncGlobalRoleBinding(db, id, role, accountStatus, logger);

  const createdUser = await fetchCreatedUser(db, id);
  await logAuditEvent(env, {
    actor_id: user.sub,
    action: 'user_created',
    resource_type: 'user',
    resource_id: id,
    metadata: { email, primary_role: role },
  });

  return json(
    req,
    { user: buildUserResponse(createdUser, role, accountStatus) },
    HTTP_STATUS.CREATED
  );
}

async function readJsonBody(req) {
  try {
    return { body: await req.json() };
  } catch {
    return { error: error(req, 'Invalid JSON body', HTTP_STATUS.BAD_REQUEST) };
  }
}

async function validateCreateUserInput(db, req, body) {
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
      return { error: error(req, err.message, HTTP_STATUS.BAD_REQUEST) };
    }
    throw err;
  }

  const requestedRole = String(body.primary_role || 'member').trim();
  const role = await resolveRequestedRole(db, requestedRole);
  const accountStatus = normalizeAccountStatus(body.account_status, 'active');

  const constraintError = await checkCreateConstraints({ db, req, password, role, email });
  if (constraintError) return { error: constraintError };

  return { email, name, password, role, accountStatus };
}

async function checkCreateConstraints({ db, req, password, role, email }) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return error(req, 'Password must be at least 8 characters', HTTP_STATUS.BAD_REQUEST);
  }
  if (!role) {
    return error(req, 'primary_role must match an existing role', HTTP_STATUS.BAD_REQUEST);
  }
  const existing = await db.first('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    return error(req, 'Email already registered', HTTP_STATUS.CONFLICT);
  }
  return null;
}

async function insertUser(db, { id, email, passwordHash, name, accountStatus }) {
  await db.run(
    `INSERT INTO users (
      id, email, password_hash, name, account_status, settings, preferences,
      created_at, updated_at, last_active_at
    ) VALUES (?, ?, ?, ?, ?, '{}', '{}', unixepoch(), unixepoch(), unixepoch())`,
    [id, email, passwordHash, name, accountStatus]
  );
}

async function fetchCreatedUser(db, id) {
  return db.first(
    'SELECT id, email, name, account_status, settings, created_at, updated_at, last_active_at FROM users WHERE id = ?',
    [id]
  );
}

function buildUserResponse(createdUser, role, accountStatus) {
  return {
    id: createdUser.id,
    email: createdUser.email,
    name: createdUser.name,
    primary_role: role,
    account_status: normalizeAccountStatus(createdUser.account_status, accountStatus),
    settings: parseSettings(createdUser.settings),
    created_at: createdUser.created_at,
    updated_at: createdUser.updated_at,
    last_active_at: createdUser.last_active_at || null,
  };
}
