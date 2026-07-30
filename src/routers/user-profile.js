import { ValidationError } from '../errors/http-errors.js';
import { optionalString, requirePlainObject } from '../validation/request.js';
import { escapeHtml, stripHtml } from '../utils/sanitize.js';
import { parseJsonObjectOrDefault } from '../utils/json.js';

export function serializeUserProfile(row) {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: escapeHtml(String(row.name || '')),
    account_status: row.account_status === 'pending' ? 'pending' : 'active',
    settings: parseJsonObjectOrDefault(row.settings, {}),
    avatar: row.avatar || null,
    avatar_emoji: row.avatar_emoji || null,
    status: row.status || 'offline',
    preferences: parseJsonObjectOrDefault(row.preferences, {}),
    created_at: row.created_at,
    last_active_at: row.last_active_at || null,
    updated_at: row.updated_at,
  };
}

export function buildUserProfileResponse(
  row,
  { defaultModelId = null, primaryRole = 'member' } = {}
) {
  return {
    user: {
      ...serializeUserProfile(row),
      primary_role: primaryRole || 'member',
    },
    app_config: {
      default_model_id: defaultModelId || null,
    },
  };
}

function parseProfileName(value) {
  const name = stripHtml(String(value || '').trim());
  if (!name) {
    throw new ValidationError('name cannot be empty after removing invalid characters');
  }
  return name;
}

function parseAvatarEmoji(value) {
  const avatarEmoji = optionalString(value);
  if (avatarEmoji && avatarEmoji.length > 50) {
    throw new ValidationError('Avatar emoji must be 50 characters or less');
  }
  return avatarEmoji;
}

function parseProfileStatus(value) {
  const status = optionalString(value, { lowercase: true });
  if (!status || !['online', 'away', 'offline'].includes(status)) {
    throw new ValidationError('Status must be one of: online, away, offline');
  }
  return status;
}

function stringifyPlainObject(value, label) {
  return JSON.stringify(requirePlainObject(value, `${label} must be an object`));
}

export function buildSelfProfileUpdate(body, { allowSettings = false } = {}) {
  const updates = [];
  const values = [];
  const updatedFields = [];

  const pushField = (key, value) => {
    updates.push(`${key} = ?`);
    values.push(value);
    updatedFields.push(key);
  };

  if (body.name !== undefined) pushField('name', parseProfileName(body.name));
  if (body.avatar !== undefined) pushField('avatar', optionalString(body.avatar));
  if (body.avatar_emoji !== undefined)
    pushField('avatar_emoji', parseAvatarEmoji(body.avatar_emoji));
  if (body.status !== undefined) pushField('status', parseProfileStatus(body.status));
  if (allowSettings && body.settings !== undefined) {
    pushField('settings', stringifyPlainObject(body.settings, 'settings'));
  }
  if (body.preferences !== undefined) {
    pushField('preferences', stringifyPlainObject(body.preferences, 'preferences'));
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
