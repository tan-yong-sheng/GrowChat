/**
 * Public Models CRUD Handler - POST/GET/PUT/DELETE /api/models/:id
 */
import { error, json } from '../../utils/response.js';
import { getAllOpenAIConnectionConfigs } from '../../llm/connections.js';
import { authorize, logAuditEvent } from '../../utils/authorize.js';
import { fetchBaseModelsFromOpenAI, toPublicModel, loadCustomModels } from './models-discovery.js';

/**
 * Handle handlePublicModelsCrud routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handlePublicModelsCrud(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  if (req.method === 'POST' && path === '/api/models') {
    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model',
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    // Validate required fields
    if (!body.id || !body.name || !body.provider || !body.base_url) {
      return error(req, 'id, name, provider, and base_url are required', 400);
    }

    // Validate provider
    const validProviders = [
      'openai',
      'custom',
      'openai-compatible',
      'google',
      'gemini-compatible',
      'anthropic',
      'claude-compatible',
    ];
    if (!validProviders.includes(body.provider)) {
      return error(
        req,
        'Provider must be one of: openai, custom, openai-compatible, google, gemini-compatible, anthropic, claude-compatible',
        400
      );
    }

    // Validate base_url
    if (!body.base_url.startsWith('http')) {
      return error(req, 'base_url must start with http:// or https://', 400);
    }

    // Validate description (optional)
    const description = body.description || `${body.name} - ${body.provider}`;

    try {
      // Check for CACHE binding early. This operation requires KV.
      if (!env.CACHE) {
        return error(
          req,
          'CACHE KV binding required to create custom models. Please configure CACHE in wrangler.jsonc',
          500
        );
      }

      // Store in KV with expiration (1 year)
      const customKey = 'custom_models';
      const customModels = await loadCustomModels(env);

      // Check for duplicate id
      const idExists = customModels.some((m) => m.id === body.id);
      if (idExists) {
        return error(req, 'Model with this ID already exists', 409);
      }

      // Check for duplicate name
      const nameExists = customModels.some((m) => m.name === body.name);
      if (nameExists) {
        return error(req, 'Model name already exists', 409);
      }

      // Add new model
      const newModel = {
        id: body.id,
        name: body.name,
        provider: body.provider,
        base_url: body.base_url,
        description: description,
        max_tokens: body.max_tokens || 4096,
        temperature: body.temperature || 0.7,
        created_at: Math.floor(Date.now() / 1000),
      };

      customModels.push(newModel);

      // Save back to KV
      await env.CACHE.put(customKey, JSON.stringify(customModels), { expirationTtl: 31536000 });

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'model_created',
        resource_type: 'model',
        resource_id: body.id,
        metadata: { provider: body.provider, name: body.name },
      });

      return json(
        req,
        {
          model: newModel,
          message: 'Model configured successfully',
        },
        201
      );
    } catch (err) {
      logger.error('Add custom model failed', { error: err?.message || err });
      return error(req, 'Failed to add custom model', 500);
    }
  }

  // GET /api/models/:id - Get model config
  if (req.method === 'GET' && path.match(/^\/api\/models\/[^/]+$/)) {
    const modelId = path.split('/').pop();

    try {
      // Check base models discovered from OpenAI-compatible providers.
      // Degrade gracefully if upstream discovery is unavailable.
      let baseModels = [];
      try {
        const modelConnections = await getAllOpenAIConnectionConfigs(env);
        baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
      } catch (err) {
        logger.warn('Failed to discover base models for GET /api/models/:id:', err?.message || err);
      }

      if (baseModels.length > 0) {
        const baseModel = baseModels.find((m) => m.id === modelId);
        if (baseModel) {
          return json(req, { model: toPublicModel(baseModel) });
        }
      }

      // Check custom models from KV with D1 fallback
      const customModels = await loadCustomModels(env);

      const customModel = customModels.find((m) => m.id === modelId);
      if (customModel) {
        return json(req, { model: toPublicModel(customModel) });
      }

      // Model not found
      return error(req, 'Model not found', 404);
    } catch (err) {
      logger.error('Get model failed', { error: err?.message || err });
      return error(req, 'Failed to fetch model', 500);
    }
  }

  // PUT /api/models/:id - Update model config (admin only)
  if (req.method === 'PUT' && path.match(/^\/api\/models\/[^/]+$/)) {
    const modelId = path.split('/').pop();

    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model',
      resourceId: modelId,
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    try {
      // Cannot update discovered base models.
      const modelConnections = await getAllOpenAIConnectionConfigs(env);
      const baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
      if (baseModels.find((m) => m.id === modelId)) {
        return error(req, 'Cannot update base model', 400);
      }

      // Check for CACHE binding early. This operation requires KV.
      if (!env.CACHE) {
        return error(
          req,
          'CACHE KV binding required to update custom models. Please configure CACHE in wrangler.jsonc',
          500
        );
      }

      // Check custom models from KV
      const customKey = 'custom_models';
      let customModels = await loadCustomModels(env);
      const modelIndex = customModels.findIndex((m) => m.id === modelId);

      if (modelIndex === -1) {
        return error(req, 'Model not found', 404);
      }

      // Track changes for audit
      // Apply updates
      if (body.name !== undefined) {
        customModels[modelIndex].name = body.name;
      }

      if (body.description !== undefined) {
        customModels[modelIndex].description = body.description;
      }

      if (body.base_url !== undefined) {
        if (!body.base_url.startsWith('http')) {
          return error(req, 'base_url must start with http:// or https://', 400);
        }
        customModels[modelIndex].base_url = body.base_url;
      }

      if (body.max_tokens !== undefined) {
        customModels[modelIndex].max_tokens = parseInt(body.max_tokens, 10);
      }

      if (body.temperature !== undefined) {
        customModels[modelIndex].temperature = parseFloat(body.temperature);
      }

      // Save back to KV
      await env.CACHE.put(customKey, JSON.stringify(customModels), { expirationTtl: 31536000 });

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'model_updated',
        resource_type: 'model',
        resource_id: modelId,
        metadata: { fields_changed: Object.keys(body) },
      });

      return json(req, {
        model: customModels[modelIndex],
        message: 'Model updated successfully',
      });
    } catch (err) {
      logger.error('Update model failed', { error: err?.message || err });
      return error(req, 'Failed to update model', 500);
    }
  }

  // DELETE /api/models/:id - Remove model config (admin only)
  if (req.method === 'DELETE' && path.match(/^\/api\/models\/[^/]+$/)) {
    const modelId = path.split('/').pop();

    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'model.admin',
      resource: 'model',
      resourceId: modelId,
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    try {
      // Cannot delete discovered base models.
      const modelConnections = await getAllOpenAIConnectionConfigs(env);
      const baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
      if (baseModels.find((m) => m.id === modelId)) {
        return error(req, 'Cannot delete base model', 400);
      }

      // Check for CACHE binding early. This operation requires KV.
      if (!env.CACHE) {
        return error(
          req,
          'CACHE KV binding required to delete custom models. Please configure CACHE in wrangler.jsonc',
          500
        );
      }

      // Check custom models from KV
      const customKey = 'custom_models';
      let customModels = await loadCustomModels(env);
      const modelIndex = customModels.findIndex((m) => m.id === modelId);

      if (modelIndex === -1) {
        return error(req, 'Model not found', 404);
      }

      // Track model being deleted
      const deletedModel = customModels[modelIndex];

      // Remove model
      customModels.splice(modelIndex, 1);

      // Save back to KV
      await env.CACHE.put(customKey, JSON.stringify(customModels), { expirationTtl: 31536000 });

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'model_deleted',
        resource_type: 'model',
        resource_id: modelId,
        metadata: { provider: deletedModel.provider, name: deletedModel.name },
      });

      return json(req, { success: true, message: 'Model removed successfully' });
    } catch (err) {
      logger.error('Delete model failed', { error: err?.message || err });
      return error(req, 'Failed to remove model', 500);
    }
  }

  return null;
}
