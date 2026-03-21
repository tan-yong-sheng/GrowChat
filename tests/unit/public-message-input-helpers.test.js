import { describe, expect, it } from 'vitest';
import {
  applyPromptVariables,
  extractPromptVariables,
  filterPromptsByQuery,
  getAttachmentAcceptTypes,
  moveQueueItem,
  promoteQueueItem,
  removeQueueItem,
  renderAttachmentListMarkup,
  renderPendingQueueMarkup,
  renderPromptPickerMarkup,
} from '../../public/js/features/chat/message-input-helpers.js';

describe('message input helpers', () => {
  it('extracts and applies prompt variables', () => {
    expect(extractPromptVariables('Hello {{ name }} and {{topic}}')).toEqual(['name', 'topic']);
    expect(applyPromptVariables('Hi {{name}}', (name) => (name === 'name' ? 'Ada' : ''))).toBe('Hi Ada');
  });

  it('filters prompts by command and title', () => {
    const prompts = [
      { command: 'summarize', title: 'Summarize text' },
      { command: 'translate', title: 'Translate' },
    ];
    expect(filterPromptsByQuery(prompts, 'sum')).toEqual([prompts[0]]);
    expect(filterPromptsByQuery(prompts, '')).toEqual(prompts);
  });

  it('manipulates pending queue items immutably', () => {
    const queue = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(moveQueueItem(queue, 3, 'up')).toEqual([{ id: 1 }, { id: 3 }, { id: 2 }]);
    expect(promoteQueueItem(queue, 3)).toEqual([{ id: 3 }, { id: 1 }, { id: 2 }]);
    expect(removeQueueItem(queue, 2)).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it('builds attachment accept lists from state', () => {
    const result = getAttachmentAcceptTypes({ models: [], activeModelId: null });
    expect(result.allowedKinds).toBeDefined();
    expect(Array.isArray(result.accepts)).toBe(true);
  });

  it('renders composer attachment, queue, and prompt markup', () => {
    expect(renderAttachmentListMarkup([{ id: 'f1', filename: '<doc>.pdf' }])).toContain('&lt;doc&gt;.pdf');
    expect(renderPendingQueueMarkup([{ id: 1, text: 'Queued <message>' }])).toContain('Queued &lt;message&gt;');
    expect(renderPromptPickerMarkup([{ command: 'summarize', title: 'Summarize text' }], 0)).toContain('/summarize');
  });
});


