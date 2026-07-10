import { normalizeToolChoice, contentToText } from './provider-adapters-utils.js';

/**
 * Shared helpers for LLM provider content adapter modules.
 *
 * These helpers are extracted from the provider-adapters-{google,anthropic}.js
 * modules to eliminate cross-file code duplication. Each helper captures
 * one pattern that appears identically in multiple provider-specific
 * adapter files.
 *
 * @module provider-adapters-shared
 */

/**
 * Parse raw tool call function arguments from `fn.arguments`.
 *
 * Handles both JSON-string (already serialized) and pre-parsed cases
 * with a try/catch guard that preserves the original value on parse
 * failure. The try/catch is required by all provider adapters to handle
 * malformed JSON in tool call arguments gracefully.
 *
 * Used identically in:
 *  - buildGooglePayload (provider-adapters-google.js)
 *  - buildAnthropicPayload (provider-adapters.js)
 *
 * @param {*} rawArgs - The raw `fn.arguments` value from a tool call
 * @returns {*} Parsed JSON object (if rawArgs was a valid JSON string),
 *          the original rawArgs string (on parse failure),
 *          or `{}` (when rawArgs is null/undefined)
 */

/**
 * Filter function-type tools from a tools array and normalize their parameters.
 *
 * Extracts the common pattern of iterating over tools, filtering by `type === 'function'`,
 * extracting the `function.function` object, and normalizing `parameters`.
 *
 * Used identically in:
 *  - buildGoogleTools (provider-adapters-google.js)
 *  - buildAnthropicTools (provider-adapters.js)
 *
 * @param {Array} tools - The tools array to filter
 * @param {Function} normalize - The normalize function for converting parameters
 * @returns {Array<{name: string, description: string, normalized: *}>} Filtered and normalized
 *          tools with distinct names, or `undefined` when no tools match
 */
export function filterAndNormalizeFunctions(tools, normalize) {
  const result = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (tool?.type !== 'function') continue;
    const fn = tool.function || {};
    const name = String(fn.name || '').trim();
    if (!name) continue;
    result.push({
      name,
      description: String(fn.description || ''),
      normalized: normalize(fn.parameters),
    });
  }
  return result.length ? result : undefined;
}

/**
 * Parse raw tool call function arguments from `fn.arguments`.
 *
 * Handles both JSON-string (already serialized) and pre-parsed cases
 * with a try/catch guard that preserves the original value on parse
 * failure. The try/catch is required by all provider adapters to handle
 * malformed JSON in tool call arguments gracefully.
 *
 * Used identically in:
 *  - buildGooglePayload (provider-adapters-google.js)
 *  - buildAnthropicPayload (provider-adapters.js)
 *
 * @param {*} rawArgs - The raw `fn.arguments` value from a tool call
 * @returns {*} Parsed JSON object (if rawArgs was a valid JSON string),
 *          the original rawArgs string (on parse failure),
 *          or `{}` (when rawArgs is null/undefined)
 */
export function parseFnArguments(rawArgs) {
  if (typeof rawArgs === 'string') {
    try {
      return JSON.parse(rawArgs);
    } catch {
      return rawArgs;
    }
  }
  return rawArgs ?? {};
}

/**
 * Resolve a tool choice value to a provider-specific configuration.
 *
 * Takes a raw or pre-normalized tool choice, normalizes it, and
 * returns the matching configuration from a config map keyed by
 * choice type. This replaces the common switch-on-type pattern
 * in buildGoogleToolConfig and buildAnthropicToolChoice.
 *
 * @param {*} toolChoice - The tool choice to resolve
 * @param {Object} [configMap={}] - Config generators keyed by type
 * @returns {*|undefined} The matched configuration or undefined
 */
/**
 * Add system content from a message to the system texts array.
 *
 * Used identically in both buildGooglePayload and buildAnthropicPayload
 * to extract and add system content from messages with role === 'system'.
 *
 * @param {Object} message - The message with system-type content
 * @param {Array} systemTexts - The system texts array to push to
 */
export function addSystemContent(message, systemTexts) {
  const text = contentToText(message.content);
  if (text) systemTexts.push(text);
}

/**
 * Normalize a message's role to lowercase for consistent role checking.
 *
 * Used identically in both buildGooglePayload and buildAnthropicPayload
 * at the start of each message iteration.
 *
 * @param {Object} message - The message to normalize
 * @returns {string} Normalized lowercase role string
 */
export function normalizeMessageRole(message) {
  return String(message?.role || '').toLowerCase();
}

/**
 * Resolve a tool choice value to a provider-specific configuration.
 *
 * Takes a raw or pre-normalized tool choice, normalizes it, and
 * returns the matching configuration from a config map keyed by
 * choice type. This replaces the common switch-on-type pattern
 * in buildGoogleToolConfig and buildAnthropicToolChoice.
 *
 * @param {*} toolChoice - The tool choice to resolve
 * @param {Object} [configMap={}] - Config generators keyed by type
 * @returns {*|undefined} The matched configuration or undefined
 */
export function resolveToolChoiceConfig(toolChoice, configMap = {}) {
  const choice = normalizeToolChoice(toolChoice);
  if (!choice) return undefined;
  const config = configMap[choice.type];
  return config ? config(choice) : undefined;
}
