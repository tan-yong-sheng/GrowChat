import { describe, expect, it } from 'vitest';
import {
  getAttachmentAcceptTypes,
  moveQueueItem,
  promoteQueueItem,
  removeQueueItem,
  renderAttachmentListMarkup,
  renderPendingQueueMarkup,
} from '../../public/js/features/chat/message-input-helpers.js';

describe('message input helpers', () => {
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

  it('renders composer attachment and queue markup', () => {
    expect(renderAttachmentListMarkup([{ id: 'f1', filename: '<doc>.pdf' }])).toContain('&lt;doc&gt;.pdf');
    expect(renderPendingQueueMarkup([{ id: 1, text: 'Queued <message>' }])).toContain('Queued &lt;message&gt;');
  });
});


