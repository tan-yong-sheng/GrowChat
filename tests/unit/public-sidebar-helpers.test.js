import { describe, expect, it } from 'vitest';
import { deriveSidebarLayout } from '../../public/js/components/sidebar-helpers.js';

describe('sidebar helpers', () => {
  it('derives hidden, mobile, collapsed, and expanded layouts', () => {
    expect(deriveSidebarLayout({ showSidebar: false })).toMatchObject({ hidden: true, width: '0px' });
    expect(deriveSidebarLayout({ showSidebar: true, isMobile: true })).toMatchObject({ width: '260px', showHandle: false });
    expect(deriveSidebarLayout({ showSidebar: true, sidebarCollapsed: true })).toMatchObject({ slim: true, width: '68px' });
    expect(deriveSidebarLayout({ showSidebar: true, sidebarCollapsed: false, sidebarWidth: 300 })).toMatchObject({ width: '300px', showHandle: true });
  });
});
