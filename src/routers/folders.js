import { json } from '../utils/response.js';

export async function foldersRouter(req, _env, _ctx, user, path) {
  if (path !== '/api/folders') return null;

  if (!user) {
    return json(req, { error: 'Unauthorized' }, 401);
  }

  if (req.method !== 'GET') {
    return json(req, { error: 'Method not allowed' }, 405);
  }

  // Folder UI exists in the frontend, but folder persistence is not implemented yet.
  // Return a stable empty payload instead of a 404 so the sidebar degrades cleanly.
  return json(req, { folders: [] });
}
