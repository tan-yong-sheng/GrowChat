import { describe, expect, it } from 'vitest';
import {
  groupChatsByDate,
  normalizeBackendQuery,
  renderSearchEmptyStateMarkup,
  renderSearchResultsMarkup,
} from '../../public/js/components/search-modal-helpers.js';

describe('search modal helpers', () => {
  it('normalizes backend queries', () => {
    expect(normalizeBackendQuery('tag:alpha hello')).toBe('hello');
  });

  it('groups chats by date label', () => {
    const groups = groupChatsByDate([
      { id: '1', created_at: '2025-03-20T00:00:00Z' },
      { id: '2', created_at: '2025-03-20T01:00:00Z' },
    ]);
    expect(Object.values(groups)[0]).toHaveLength(2);
  });

  it('renders empty and grouped result markup', () => {
    expect(renderSearchEmptyStateMarkup('test')).toContain('No results found');
    const html = renderSearchResultsMarkup([
      { id: 'c1', title: '<Alpha>', created_at: '2025-03-20T00:00:00Z' },
    ], 'al');
    expect(html).toContain('data-search-chat="c1"');
    expect(html).toContain('<span class="bg-yellow-200 text-yellow-900 rounded-sm">Al</span>');
  });
});
