const MAX_TOOL_STEPS = 100;
const MAX_FOLLOW_UPS = 20;
const FOLLOW_UP_PROMPT =
  'Provide a complete final answer to the user. Do not return tool calls or reasoning-only output.';
const STREAM_KEEPALIVE_INTERVAL_MS = 15000;
const STREAM_HARD_TIMEOUT_MS = 10 * 60 * 1000;
const STREAM_KEEPALIVE_PAYLOAD = ':\n\n';
export const STREAM_STATUS_STALE_MS = 10 * 60 * 1000;

export {
  MAX_TOOL_STEPS,
  MAX_FOLLOW_UPS,
  FOLLOW_UP_PROMPT,
  STREAM_KEEPALIVE_INTERVAL_MS,
  STREAM_HARD_TIMEOUT_MS,
  STREAM_KEEPALIVE_PAYLOAD,
};

export async function readStreamChunkWithHeartbeat(
  reader,
  {
    controller = null,
    encoder = new TextEncoder(),
    keepAliveIntervalMs = STREAM_KEEPALIVE_INTERVAL_MS,
    hardTimeoutMs = STREAM_HARD_TIMEOUT_MS,
    heartbeatPayload = STREAM_KEEPALIVE_PAYLOAD,
  } = {}
) {
  let heartbeatTimer = null;
  let timeoutId = null;
  let timedOut = false;

  if (controller && typeof controller.enqueue === 'function' && keepAliveIntervalMs > 0) {
    heartbeatTimer = setInterval(() => {
      try {
        controller.enqueue(encoder.encode(heartbeatPayload));
      } catch {
        // ignore heartbeat enqueue failure
      }
    }, keepAliveIntervalMs);
  }

  const pendingReads = [reader.read()];

  if (hardTimeoutMs > 0) {
    pendingReads.push(
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          reject(new Error('LLM stream timed out'));
        }, hardTimeoutMs);
      })
    );
  }

  try {
    return await Promise.race(pendingReads);
  } catch (err) {
    if (timedOut && typeof reader.cancel === 'function') {
      void reader.cancel().catch(() => {});
    }
    throw err;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (timeoutId) clearTimeout(timeoutId);
  }
}
