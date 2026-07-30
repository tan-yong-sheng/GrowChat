const MAX_TOOL_STEPS = 100;
const MAX_FOLLOW_UPS = 20;
const FOLLOW_UP_PROMPT =
  'Provide a complete final answer to the user. Do not return tool calls or reasoning-only output.';
const STREAM_KEEPALIVE_INTERVAL_MS = 15000;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const STREAM_TIMEOUT_MINUTES = 10;
const STREAM_HARD_TIMEOUT_MS = STREAM_TIMEOUT_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;
const STREAM_KEEPALIVE_PAYLOAD = ':\n\n';
export const STREAM_STATUS_STALE_MS = STREAM_TIMEOUT_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

export {
  MAX_TOOL_STEPS,
  MAX_FOLLOW_UPS,
  FOLLOW_UP_PROMPT,
  STREAM_KEEPALIVE_INTERVAL_MS,
  STREAM_HARD_TIMEOUT_MS,
  STREAM_KEEPALIVE_PAYLOAD,
};

function cancelReaderSilently(reader) {
  if (typeof reader?.cancel === 'function') {
    void reader.cancel().catch(() => {});
  }
}

function resolveEffectiveTimeoutMs(reader, deadlineAt, hardTimeoutMs) {
  if (!deadlineAt || typeof deadlineAt !== 'number' || deadlineAt <= 0) return hardTimeoutMs;
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs > 0) return remainingMs;
  cancelReaderSilently(reader);
  throw new Error('LLM stream timed out (deadline exceeded)');
}

function startHeartbeat(controller, encoder, heartbeatPayload, keepAliveIntervalMs) {
  if (!controller || typeof controller.enqueue !== 'function' || keepAliveIntervalMs <= 0)
    return null;
  return setInterval(() => {
    try {
      controller.enqueue(encoder.encode(heartbeatPayload));
    } catch {
      // ignore heartbeat enqueue failure
    }
  }, keepAliveIntervalMs);
}

function createTimeoutRace(reader, timeoutMs) {
  if (timeoutMs <= 0) return null;
  let timeoutId = null;
  const promise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      cancelReaderSilently(reader);
      reject(new Error('LLM stream timed out'));
    }, timeoutMs);
  });
  return { promise, timeoutId };
}

export async function readStreamChunkWithHeartbeat(reader, options = {}) {
  const opts = normalizeStreamReadOptions(options);
  const cleanup = setupStreamReadCleanup(reader, opts);
  return await raceStreamReads(reader, cleanup);
}

function normalizeStreamReadOptions(options) {
  return {
    controller: options.controller ?? null,
    encoder: options.encoder ?? new TextEncoder(),
    keepAliveIntervalMs: options.keepAliveIntervalMs ?? STREAM_KEEPALIVE_INTERVAL_MS,
    hardTimeoutMs: options.hardTimeoutMs ?? STREAM_HARD_TIMEOUT_MS,
    heartbeatPayload: options.heartbeatPayload ?? STREAM_KEEPALIVE_PAYLOAD,
    deadlineAt: options.deadlineAt ?? null,
  };
}

function setupStreamReadCleanup(reader, opts) {
  const effectiveTimeoutMs = resolveEffectiveTimeoutMs(reader, opts.deadlineAt, opts.hardTimeoutMs);
  const heartbeatTimer = startHeartbeat(
    opts.controller,
    opts.encoder,
    opts.heartbeatPayload,
    opts.keepAliveIntervalMs
  );
  const timeoutRace = createTimeoutRace(reader, effectiveTimeoutMs);
  return { heartbeatTimer, timeoutRace };
}

async function raceStreamReads(reader, cleanup) {
  const pendingReads = [reader.read()];
  if (cleanup.timeoutRace) pendingReads.push(cleanup.timeoutRace.promise);
  try {
    return await Promise.race(pendingReads);
  } finally {
    teardownStreamReadTimers(cleanup);
  }
}

function teardownStreamReadTimers(cleanup) {
  if (cleanup.heartbeatTimer) clearInterval(cleanup.heartbeatTimer);
  if (cleanup.timeoutRace) clearTimeout(cleanup.timeoutRace.timeoutId);
}
export function createStreamHelpers({ db, assistantMsgId, encoder, sseData }) {
  const state = { deltaSeq: 0, streamController: null };
  const messageBlocks = [];

  const persistDelta = async (payload) => {
    if (!payload || typeof payload !== 'object') return payload;
    state.deltaSeq += 1;
    const payloadWithSeq = { ...payload, seq: state.deltaSeq };
    try {
      await db.run(
        'INSERT INTO message_deltas (message_id, seq, payload, created_at) VALUES (?, ?, ?, unixepoch())',
        [assistantMsgId, state.deltaSeq, JSON.stringify(payloadWithSeq)]
      );
    } catch {
      // ignore delta persistence failure
    }
    return payloadWithSeq;
  };

  const emitSse = async (payload, { persist = false } = {}) => {
    const outgoing = persist ? await persistDelta(payload) : payload;
    if (!state.streamController) return outgoing;
    state.streamController.enqueue(encoder.encode(sseData(outgoing)));
    return outgoing;
  };

  const findToolBlock = (toolCallId) =>
    messageBlocks.find((block) => block.type === 'tool' && block.tool_call_id === toolCallId);

  const appendToolBlock = (toolCallId) => {
    messageBlocks.push({ type: 'tool', tool_call_id: String(toolCallId || '') });
  };

  const mergeOrAppendContent = (type, content) => {
    const last = messageBlocks.length ? messageBlocks[messageBlocks.length - 1] : null;
    if (last && last.type === type && !last.tool_call_id) {
      last.content = `${last.content || ''}${content}`;
      return;
    }
    messageBlocks.push({ type, content: String(content || '') });
  };

  const appendMessageBlock = ({ type, content = '', toolCallId = null } = {}) => {
    if (!type) return;
    if (type === 'tool') {
      if (findToolBlock(toolCallId)) return;
      appendToolBlock(toolCallId);
      return;
    }
    mergeOrAppendContent(type, content);
  };

  return { persistDelta, emitSse, appendMessageBlock, messageBlocks, state };
}
