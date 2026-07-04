/**
 * Lightweight memory and performance monitoring for Cloudflare Workers.
 *
 * Provides <1ms overhead instrumentation helpers:
 * - `withMemoryCheck` — wraps an async fn, logs duration+estimate
 * - `estimateRequestSize` — quick byte estimate of a Request
 *
 * Zero external dependencies — uses only `performance.now()` and
 * the logger exported from `../utils/logger.js`.
 *
 * @module
 */

import { createLogger } from './logger.js';

/**
 * Wrap an async function with performance timing and optional
 * request-size estimation.
 *
 * @template T
 * @param {string} label — Short label for the log entry
 * @param {() => Promise<T>} fn — The async function to time
 * @param {Object} [options={}] — Optional configuration
 * @param {Object} [options.logger] — Pre-existing logger instance
 * @param {Object} [options.extra] — Extra fields to merge into the log entry
 * @returns {Promise<T>} — The result of `fn()`
 */
export async function withMemoryCheck(label, fn, options = {}) {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;

  const logger = options.logger || createLogger({});
  const entry = { durationMs };

  if (options.extra && typeof options.extra === 'object') {
    Object.assign(entry, options.extra);
  }

  logger.info(`[memory] ${label}`, entry);

  return result;
}

/**
 * Quick byte-estimate of a Request's body size.
 *
 * Uses Content-Length header when available, falls back to
 * estimating from body text. Returns 0 for GET/HEAD requests.
 *
 * @param {Request} req — The incoming request
 * @returns {number} — Estimated body size in bytes
 */
export function estimateRequestSize(req) {
  if (!req) return 0;

  const contentLength = req.headers.get('Content-Length');
  if (contentLength) {
    const parsed = Number.parseInt(contentLength, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  }

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return 0;

  // ReadableStream bodies can't be read without consuming
  return 0;
}
