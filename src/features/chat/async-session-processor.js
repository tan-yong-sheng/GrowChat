function validateRunner(runStep) {
  if (typeof runStep !== 'function') {
    throw new Error('runStep is required');
  }
}

function validateStepResult(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('Async session step must return an object');
  }
}

function updateMessages(state, result) {
  if (Array.isArray(result.nextMessagesForModel)) {
    state.messagesForModel = result.nextMessagesForModel;
  }
}

function applyAction(state, action, maxToolSteps, maxFollowUps) {
  if (action === 'tool_loop') {
    state.steps += 1;
    if (state.steps > maxToolSteps) {
      throw new Error('Too many tool calls in a single request');
    }
    return 'continue';
  }

  if (action === 'follow_up') {
    state.followUps += 1;
    if (state.followUps > maxFollowUps) {
      throw new Error('Too many follow-up turns in a single request');
    }
    return 'continue';
  }

  return 'return';
}

function createResult(state, lastResult) {
  return {
    messagesForModel: state.messagesForModel,
    steps: state.steps,
    followUps: state.followUps,
    lastResult,
  };
}

export async function runAsyncSessionProcessor({
  initialMessages = [],
  maxToolSteps = 100,
  maxFollowUps = 20,
  runStep,
}) {
  validateRunner(runStep);

  const state = {
    messagesForModel: Array.isArray(initialMessages) ? [...initialMessages] : [],
    steps: 0,
    followUps: 0,
  };

  while (state.steps <= maxToolSteps) {
    const result = await runStep({
      messagesForModel: state.messagesForModel,
      steps: state.steps,
      followUps: state.followUps,
    });

    validateStepResult(result);
    updateMessages(state, result);

    const action = String(result.action || 'final');
    const outcome = applyAction(state, action, maxToolSteps, maxFollowUps);
    if (outcome === 'return') {
      return createResult(state, result);
    }
  }

  throw new Error('Too many tool calls in a single request');
}
