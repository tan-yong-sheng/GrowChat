import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { createDB } from '../../db.js';
import { loadModelAclRules } from '../../utils/model-acl.js';
import { requireModelAdmin } from './models-public-crud-helpers.js';
import { loadGroups } from './models-admin-access-helpers.js';

function parseRequestedIds(req) {
  const url = new URL(req.url);
  const rawIds = String(url.searchParams.get('ids') || '');
  return rawIds
    .split(',')
    .map((value) => decodeURIComponent(String(value || '').trim()))
    .filter(Boolean);
}
export async function handleAdminModelsAccessList(req, env, _ctx, user, _path, { logger }) {
  const authError = await requireModelAdmin(req, env, user);
  if (authError) return authError;

  try {
    const db = createDB(env.DB);
    const ids = parseRequestedIds(req);
    const groups = await loadGroups(db);
    const rules = await loadModelAclRules(db, null, ids.length ? ids : null);
    return json(req, {
      model_ids: ids,
      groups,
      rules,
    });
  } catch (err) {
    logger.error('Load model access failed', { error: err?.message || err });
    return error(req, 'Failed to load model access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
