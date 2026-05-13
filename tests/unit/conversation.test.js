import { describe, expect, it } from 'vitest';
import { projectConversation, resolveConversationLeafId } from '../../public/js/shared/utils/conversation.js';

describe('projectConversation', () => {
  it('returns empty projections for empty input', () => {
    const result = projectConversation([], null, new Map());
    expect(result.visible).toEqual([]);
    expect(result.roundsByMessageId.size).toBe(0);
  });

  it('projects a linear chat when no parent links exist', () => {
    const result = projectConversation([
      { id: 'm1', created_at: 1, role: 'user' },
      { id: 'm2', created_at: 2, role: 'assistant' },
      { id: 'm3', created_at: 3, role: 'user' },
    ], null, new Map());

    expect(result.visible.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(result.roundsByMessageId.get('m2')).toMatchObject({
      total: 1,
      index: 1,
      prevId: null,
      nextId: null,
      parentKey: 'm1',
    });
  });

  it('keeps same-second messages in source order', () => {
    const result = projectConversation([
      { id: 'u1', created_at: 10, role: 'user' },
      { id: 'a1', parent_id: 'u1', created_at: 10, role: 'assistant' },
      { id: 'u2', parent_id: 'a1', created_at: 10, role: 'user' },
    ], 'u2', new Map());

    expect(result.visible.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
  });

  it('respects branch selection overrides', () => {
    const branchSelectionMap = new Map([
      ['m1', 'm3'],
    ]);

    const result = projectConversation([
      { id: 'm1', created_at: 1, role: 'user' },
      { id: 'm2', parent_id: 'm1', created_at: 2, role: 'assistant' },
      { id: 'm3', parent_id: 'm1', created_at: 3, role: 'assistant' },
      { id: 'm4', parent_id: 'm2', created_at: 4, role: 'user' },
    ], 'm4', branchSelectionMap);

    expect(result.visible.map((m) => m.id)).toEqual(['m1', 'm3']);
    expect(result.roundsByMessageId.get('m3')).toMatchObject({
      total: 2,
      index: 2,
      prevId: 'm2',
      nextId: null,
      parentKey: 'm1',
    });
  });

  it('keeps the active leaf when reloading branched conversations', () => {
    const messages = [
      { id: 'm1', created_at: 1, role: 'user' },
      { id: 'm2', parent_id: 'm1', created_at: 2, role: 'assistant' },
      { id: 'm3', parent_id: 'm1', created_at: 3, role: 'assistant' },
    ];

    expect(resolveConversationLeafId(messages, {
      previousLeafId: 'm2',
    })).toBe('m2');
    expect(resolveConversationLeafId(messages, {
      currentMessageId: 'm3',
      previousLeafId: 'm2',
    })).toBe('m3');
    expect(resolveConversationLeafId(messages, {
      fallbackMessageId: 'm2',
      previousLeafId: 'm3',
    })).toBe('m2');
    expect(resolveConversationLeafId(messages, {
      preferredLeafId: 'm3',
      currentMessageId: 'm2',
      previousLeafId: 'm1',
    })).toBe('m3');
  });
});


