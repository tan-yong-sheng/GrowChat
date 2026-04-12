import { describe, expect, it, vi } from 'vitest';
import {
  groupChatsByDate,
  getSearchChatDateLabel,
  normalizeBackendQuery,
  renderSearchEmptyStateMarkup,
  renderSearchResultsMarkup,
} from '../../public/js/shared/components/search-modal-helpers.js';

vi.mock('../../public/js/shared/utils.js', () => ({
  formatDate: (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  },
}));

describe('search modal helpers', () => {
  it('normalizes backend queries', () => {
    expect(normalizeBackendQuery('pinned:true hello')).toBe('hello');
  });

  it('groups chats by date label', () => {
    const groups = groupChatsByDate([
      { id: '1', created_at: '2025-03-20T00:00:00Z' },
      { id: '2', created_at: '2025-03-20T01:00:00Z' },
    ]);
    expect(Object.values(groups)[0]).toHaveLength(2);
  });

  it('avoids january 1970 labels for missing or epoch dates', () => {
    expect(getSearchChatDateLabel(null)).toBe('Unknown date');
    expect(getSearchChatDateLabel('1970-06-01T00:00:00Z')).toBe('Unknown date');
    const groups = groupChatsByDate([
      { id: '1', created_at: null },
      { id: '2', created_at: '1970-06-01T00:00:00Z' },
    ]);
    expect(groups['Unknown date']).toHaveLength(2);
  });

  it('renders empty and grouped result markup', () => {
    expect(renderSearchEmptyStateMarkup('test')).toContain('No results found');
    const html = renderSearchResultsMarkup([
      { id: 'c1', title: '<Alpha>', created_at: '2025-03-20T00:00:00Z' },
    ], 'al');
    expect(html).toContain('data-search-chat="c1"');
    expect(html).toContain('<span class="bg-yellow-200 text-yellow-900 rounded-sm">Al</span>');
  });

  it('renders unknown date labels instead of january 1970', () => {
    const html = renderSearchResultsMarkup([
      { id: 'c1', title: 'Missing Date', created_at: '1970-06-01T00:00:00Z' },
    ], '');
    expect(html).toContain('Unknown date');
    expect(html).not.toContain('January 1970');
  });
});


