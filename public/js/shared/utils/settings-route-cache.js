import {
  consumeConnectionsInvalidation,
} from './connection-sync.js';
import {
  consumeModelsInvalidation,
} from './model-sync.js';
import {
  consumeToolServersInvalidation,
} from './tool-server-sync.js';

function invokeHandler(handler) {
  if (typeof handler !== 'function') return;
  try {
    const result = handler();
    if (result && typeof result.then === 'function') {
      result.catch((err) => {
        console.warn('Failed to refresh settings cache', err);
      });
    }
  } catch (err) {
    console.warn('Failed to refresh settings cache', err);
  }
}

function createChannel(consumer) {
  let handler = null;
  let pending = false;

  const dispatch = () => {
    if (typeof handler === 'function') {
      pending = false;
      invokeHandler(handler);
    } else {
      pending = true;
    }
  };

  const consume = () => {
    if (typeof consumer !== 'function') return;
    const token = consumer();
    if (token) dispatch();
  };

  const register = (nextHandler) => {
    handler = nextHandler;
    if (pending && typeof handler === 'function') {
      pending = false;
      invokeHandler(handler);
    }
    return () => {
      if (handler === nextHandler) {
        handler = null;
      }
    };
  };

  return {
    consume,
    register,
  };
}

export function createSettingsRouteCache() {
  const connections = createChannel(consumeConnectionsInvalidation);
  const models = createChannel(consumeModelsInvalidation);
  const toolServers = createChannel(consumeToolServersInvalidation);

  const handleStorage = (event) => {
    const key = String(event?.key || '');
    if (!key) return;
    if (key === 'growchat_connections_invalidate') {
      connections.consume();
    } else if (key === 'growchat_models_invalidate') {
      models.consume();
    } else if (key === 'growchat_tool_servers_invalidate') {
      toolServers.consume();
    }
  };

  const bind = () => {
    connections.consume();
    models.consume();
    toolServers.consume();

    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('storage', handleStorage);
    }

    return () => {
      if (typeof globalThis.removeEventListener === 'function') {
        globalThis.removeEventListener('storage', handleStorage);
      }
    };
  };

  return {
    bind,
    registerConnectionsRefresh: connections.register,
    registerModelsRefresh: models.register,
    registerToolServersRefresh: toolServers.register,
  };
}
