import { ValidationError } from '../errors/http-errors.js';
import { optionalString, requirePlainObject } from '../validation/request.js';

function parseJsonObject(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function serializeUserProfile(row) {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    account_status: row.account_status === 'pending' ? 'pending' : 'active',
    settings: parseJsonObject(row.settings),
    avatar: row.avatar || null,
    avatar_emoji: row.avatar_emoji || null,
    status: row.status || 'offline',
    preferences: parseJsonObject(row.preferences),
    created_at: row.created_at,
    last_active_at: row.last_active_at || null,
    updated_at: row.updated_at,
  };
}

export function buildUserProfileResponse(row, { defaultModelId = null } = {}) {
  return {
    user: serializeUserProfile(row),
    app_config: {
      default_model_id: defaultModelId || null,
    },
  };
}

export function buildSelfProfileUpdate(body, { allowSettings = false } = {}) {
  const updates = [];
  const values = [];
  const updatedFields = [];

  if (body.name !== undefined) {
    const name = optionalString(body.name);
    if (!name) {
      throw new ValidationError('name cannot be empty');
    }
    updates.push('name = ?');
    values.push(name);
    updatedFields.push('name');
  }

  if (body.avatar !== undefined) {
    const avatar = optionalString(body.avatar);
    updates.push('avatar = ?');
    values.push(avatar);
    updatedFields.push('avatar');
  }

  if (body.avatar_emoji !== undefined) {
    const avatarEmoji = optionalString(body.avatar_emoji);
    if (avatarEmoji && avatarEmoji.length > 50) {
      throw new ValidationError('Avatar emoji must be 50 characters or less');
    }
    updates.push('avatar_emoji = ?');
    values.push(avatarEmoji);
    updatedFields.push('avatar_emoji');
  }

  if (body.status !== undefined) {
    const status = optionalString(body.status, { lowercase: true });
    if (!status || !['online', 'away', 'offline'].includes(status)) {
      throw new ValidationError('Status must be one of: online, away, offline');
    }
    updates.push('status = ?');
    values.push(status);
    updatedFields.push('status');
  }

  if (allowSettings && body.settings !== undefined) {
    const settings = requirePlainObject(body.settings, 'settings must be an object');
    updates.push('settings = ?');
    values.push(JSON.stringify(settings));
    updatedFields.push('settings');
  }

  if (body.preferences !== undefined) {
    const preferences = requirePlainObject(body.preferences, 'preferences must be an object');
    updates.push('preferences = ?');
    values.push(JSON.stringify(preferences));
    updatedFields.push('preferences');
  }

  if (updates.length === 0) {
    throw new ValidationError('No fields to update');
  }

  return {
    updates,
    values,
    updatedFields,
  };
}
