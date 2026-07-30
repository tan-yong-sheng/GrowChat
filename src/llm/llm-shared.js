import { normalizeProviderFamily } from './provider-registry.js';

/**
 * Find a connection in the given list that matches a provider info's connectionId and providerFamily.
 * Returns null if no match, otherwise the matching connection.
 */
export function findMatchingConnection(allConnections, providerInfo) {
  return allConnections.find((conn) => {
    if (String(conn.id) !== providerInfo.connectionId) return false;
    const family = normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai';
    return family === providerInfo.providerFamily;
  });
}
