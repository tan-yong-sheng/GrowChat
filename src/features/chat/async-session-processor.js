export async function runAsyncSessionProcessor({
  initialMessages = [],
  maxToolSteps = 100,
  maxFollowUps = 20,
  runStep,
}) {
  if (typeof runStep !== 'function') {
    throw new Error('runStep is required');
  }

  let messagesForModel = Array.isArray(initialMessages) ? [...initialMessages] : [];
  let steps = 0;
  let followUps = 0;

  while (steps <= maxToolSteps) {
    const result = await runStep({
      messagesForModel,
      steps,
      followUps,
    });

    if (!result || typeof result !== 'object') {
      throw new Error('Async session step must return an object');
    }

    if (Array.isArray(result.nextMessagesForModel)) {
      messagesForModel = result.nextMessagesForModel;
    }

    const action = String(result.action || 'final');
    if (action === 'tool_loop') {
      steps += 1;
      if (steps > maxToolSteps) {
        throw new Error('Too many tool calls in a single request');
      }
      continue;
    }

    if (action === 'follow_up') {
      followUps += 1;
      if (followUps > maxFollowUps) {
        throw new Error('Too many follow-up turns in a single request');
      }
      continue;
    }

    return {
      messagesForModel,
      steps,
      followUps,
      lastResult: result,
    };
  }

  throw new Error('Too many tool calls in a single request');
}
