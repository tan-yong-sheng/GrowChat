import { describe, expect, it } from 'vitest';
import {
  buildFooterMarkup,
  computePresence,
  getAvatarLabel,
  getStatusColor,
} from '../../public/js/shared/components/user-profile-footer-helpers.js';

describe('user profile footer helpers', () => {
  it('derives avatar labels and status colors', () => {
    expect(getAvatarLabel({ name: 'Ada' })).toBe('A');
    expect(getStatusColor('offline')).toBe('bg-gray-400');
  });

  it('computes presence from idle time', () => {
    const now = Date.now();
    expect(computePresence(now - 1000)).toBe('online');
    expect(computePresence(now - 10 * 60 * 1000)).toBe('away');
  });

  it('renders footer markup', () => {
    const html = buildFooterMarkup({ name: '<User>', avatar_emoji: '🙂' }, true);
    expect(html).toContain('&lt;User&gt;');
    expect(html).toContain('Admin Settings');
  });
});


