/**
 * Prompts Router
 *
 * Manages reusable system and user prompts
 * Routes:
 *   GET    /api/prompts/list               - List user's prompts
 *   POST   /api/prompts/create             - Create new prompt
 *   GET    /api/prompts/:id                - Get prompt by ID
 *   PUT    /api/prompts/:id                - Update prompt
 *   DELETE /api/prompts/:id                - Delete prompt
 *   GET    /api/prompts/command/:command   - Get prompt by command (fast lookup)
 *   POST   /api/prompts/:id/toggle         - Toggle active/inactive state
 */

import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';

function requireAuth(req, user) {
  if (!user) return error(req, 'Unauthorized', 401);
  return null;
}

function requireAdmin(req, user) {
  if (!user || user.role !== 'admin') return error(req, 'Forbidden', 403);
  return null;
}

async function getOwnedPrompt(db, promptId, userId, includeInactive = false) {
  const condition = includeInactive ? '' : ' AND is_active = 1';
  return db.first(
    `SELECT * FROM prompts WHERE id = ? AND user_id = ?${condition}`,
    [promptId, userId]
  );
}

export async function promptsRouter(req, env, _ctx, user, path) {
  const isPromptsPath = path === '/api/prompts/list' || path === '/api/prompts/create' ||
    /^\/api\/prompts\/[^/]+(?:\/(?:toggle))?$/.test(path) ||
    /^\/api\/prompts\/command\/[^/]+$/.test(path);
  if (!isPromptsPath) return null;

  const authErr = requireAuth(req, user);
  if (authErr) return authErr;

  const db = createDB(env.DB);

  // GET /api/prompts/list - List user's prompts (including global)
  if (req.method === 'GET' && path === '/api/prompts/list') {
    const url = new URL(req.url);
    const category = url.searchParams.get('category') || '';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50'), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);

    try {
      let query = `SELECT id, title, content, command, category, is_global, is_active, created_at, updated_at
                   FROM prompts
                   WHERE is_active = 1 AND (user_id = ? OR is_global = 1)`;
      const params = [user.sub];

      if (category && category.length <= 50) {
        query += ` AND category = ?`;
        params.push(category);
      }

      query += ` ORDER BY is_global DESC, updated_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const prompts = await db.all(query, params);
      return json(req, { prompts, limit, offset, category });
    } catch (err) {
      console.error('List prompts failed:', err);
      return error(req, 'Failed to list prompts', 500);
    }
  }

  // POST /api/prompts/create - Create new prompt
  if (req.method === 'POST' && path === '/api/prompts/create') {
    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    const title = (body.title || '').trim();
    const content = (body.content || '').trim();
    const command = (body.command || '').trim().toLowerCase();
    const category = (body.category || 'general').trim().toLowerCase().slice(0, 50);

    if (!title || title.length > 200) {
      return error(req, 'Title required (1-200 chars)', 400);
    }
    if (!content || content.length > 5000) {
      return error(req, 'Content required (1-5000 chars)', 400);
    }

    // Command is optional but must be unique per user if provided
    if (command && command.length > 100) {
      return error(req, 'Command too long (max 100 chars)', 400);
    }

    try {
      const promptId = crypto.randomUUID();
      await db.run(
        `INSERT INTO prompts (id, user_id, title, content, command, category, is_global, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, unixepoch(), unixepoch())`,
        [promptId, user.sub, title, content, command || null, category]
      );

      const prompt = await db.first('SELECT * FROM prompts WHERE id = ?', [promptId]);
      return json(req, { prompt }, 201);
    } catch (err) {
      console.error('Create prompt failed:', err);
      // Check for unique constraint on command
      if (/unique constraint/i.test(String(err))) {
        return error(req, `Command "${command}" already in use`, 409);
      }
      return error(req, 'Failed to create prompt', 500);
    }
  }

  // GET /api/prompts/:id - Get prompt by ID
  const getMatch = path.match(/^\/api\/prompts\/([^/]+)$/);
  if (getMatch && req.method === 'GET') {
    const promptId = getMatch[1];
    if (promptId === 'list' || promptId === 'create') return null; // Skip path params that match routes

    try {
      const prompt = await getOwnedPrompt(db, promptId, user.sub);
      if (!prompt) return error(req, 'Prompt not found', 404);

      return json(req, { prompt });
    } catch (err) {
      console.error('Get prompt failed:', err);
      return error(req, 'Failed to get prompt', 500);
    }
  }

  // PUT /api/prompts/:id - Update prompt
  const putMatch = path.match(/^\/api\/prompts\/([^/]+)$/);
  if (putMatch && req.method === 'PUT') {
    const promptId = putMatch[1];
    if (promptId === 'list' || promptId === 'create') return null;

    let body = {};
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON', 400);
    }

    try {
      const prompt = await getOwnedPrompt(db, promptId, user.sub, true);
      if (!prompt) return error(req, 'Prompt not found', 404);

      // Don't allow updating global prompts unless admin
      if (prompt.is_global && user.role !== 'admin') {
        return error(req, 'Cannot modify global prompt', 403);
      }

      const title = body.title !== undefined ? String(body.title).trim() : prompt.title;
      const content = body.content !== undefined ? String(body.content).trim() : prompt.content;
      const category = body.category !== undefined ? String(body.category).trim().toLowerCase().slice(0, 50) : prompt.category;

      if (!title || title.length > 200) {
        return error(req, 'Title required (1-200 chars)', 400);
      }
      if (!content || content.length > 5000) {
        return error(req, 'Content required (1-5000 chars)', 400);
      }

      await db.run(
        `UPDATE prompts SET title = ?, content = ?, category = ?, updated_at = unixepoch()
         WHERE id = ? AND user_id = ?`,
        [title, content, category, promptId, user.sub]
      );

      const updated = await getOwnedPrompt(db, promptId, user.sub, true);
      return json(req, { prompt: updated });
    } catch (err) {
      console.error('Update prompt failed:', err);
      return error(req, 'Failed to update prompt', 500);
    }
  }

  // DELETE /api/prompts/:id - Delete (soft-delete) prompt
  const delMatch = path.match(/^\/api\/prompts\/([^/]+)$/);
  if (delMatch && req.method === 'DELETE') {
    const promptId = delMatch[1];
    if (promptId === 'list' || promptId === 'create') return null;

    try {
      const prompt = await getOwnedPrompt(db, promptId, user.sub, true);
      if (!prompt) return error(req, 'Prompt not found', 404);

      // Don't allow deleting global prompts unless admin
      if (prompt.is_global && user.role !== 'admin') {
        return error(req, 'Cannot delete global prompt', 403);
      }

      // Soft delete by setting is_active = 0
      await db.run(
        `UPDATE prompts SET is_active = 0, updated_at = unixepoch() WHERE id = ? AND user_id = ?`,
        [promptId, user.sub]
      );

      return json(req, { ok: true });
    } catch (err) {
      console.error('Delete prompt failed:', err);
      return error(req, 'Failed to delete prompt', 500);
    }
  }

  // GET /api/prompts/command/:command - Fast command lookup
  const commandMatch = path.match(/^\/api\/prompts\/command\/([^/]+)$/);
  if (commandMatch && req.method === 'GET') {
    const command = commandMatch[1];

    if (!command || command.length > 100 || !/^[a-z0-9_-]+$/.test(command)) {
      return error(req, 'Invalid command', 400);
    }

    try {
      // Look for user's prompt first, then global
      const prompt = await db.first(
        `SELECT * FROM prompts
         WHERE command = ? AND is_active = 1 AND (user_id = ? OR is_global = 1)
         ORDER BY user_id ASC LIMIT 1`,
        [command, user.sub]
      );

      if (!prompt) return error(req, 'Command not found', 404);

      return json(req, { prompt });
    } catch (err) {
      console.error('Command lookup failed:', err);
      return error(req, 'Failed to lookup command', 500);
    }
  }

  // POST /api/prompts/:id/toggle - Toggle active/inactive
  const toggleMatch = path.match(/^\/api\/prompts\/([^/]+)\/toggle$/);
  if (toggleMatch && req.method === 'POST') {
    const promptId = toggleMatch[1];

    try {
      const prompt = await getOwnedPrompt(db, promptId, user.sub, true);
      if (!prompt) return error(req, 'Prompt not found', 404);

      // Don't allow toggling global prompts unless admin
      if (prompt.is_global && user.role !== 'admin') {
        return error(req, 'Cannot modify global prompt', 403);
      }

      const newActive = prompt.is_active ? 0 : 1;
      await db.run(
        `UPDATE prompts SET is_active = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?`,
        [newActive, promptId, user.sub]
      );

      const updated = await getOwnedPrompt(db, promptId, user.sub, true);
      return json(req, { prompt: updated, is_active: newActive === 1 });
    } catch (err) {
      console.error('Toggle prompt failed:', err);
      return error(req, 'Failed to toggle prompt', 500);
    }
  }

  return null;
}
