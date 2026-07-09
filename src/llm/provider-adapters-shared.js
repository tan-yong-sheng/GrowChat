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
