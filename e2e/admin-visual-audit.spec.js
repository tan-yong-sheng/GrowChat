import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8787';
const TEST_EMAIL = 'tys203831@gmail.com';
const TEST_PASSWORD = '&Test1234';

test.describe('Admin Pages - Visual Consistency Audit', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  async function login() {
    await page.goto(`${BASE_URL}/auth.html`);
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Login")');
    await page.waitForNavigation();
  }

  test('1. Auth and navigate to admin area', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/auth.html`);

    // Fill login form
    await testPage.fill('input[type="email"]', TEST_EMAIL);
    await testPage.fill('input[type="password"]', TEST_PASSWORD);

    // Click login button
    const loginBtn = testPage.locator('button:has-text("Login")');
    await loginBtn.click();

    // Wait for navigation to complete
    await testPage.waitForURL(/^http:\/\/localhost:8787\/$/, { timeout: 5000 });

    // Navigate to admin
    await testPage.goto(`${BASE_URL}/admin/users/overview`);
    await expect(testPage).toHaveURL(/admin/);

    console.log('✓ Authentication successful, admin area accessible');
  });

  test('2. Admin Users Overview - Layout & Structure', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/admin/users/overview`);
    await testPage.waitForLoadState('networkidle');

    // Check header exists
    const header = testPage.locator('h1, h2, [role="heading"]').first();
    await expect(header).toBeVisible();

    // Check navigation tabs
    const tabs = testPage.locator('[data-subnav]');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThan(0);
    console.log(`✓ Users/Overview: Found ${tabCount} navigation tabs`);

    // Screenshot at desktop
    await testPage.setViewportSize({ width: 1024, height: 768 });
    await testPage.screenshot({ path: '/c/Users/tys/Documents/Coding/GrowChat/audit/01-admin-users-overview-1024.png' });
    console.log('✓ Users/Overview desktop screenshot captured');
  });

  test('3. Admin Users Roles - Layout & Button Styles', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/admin/users/roles`);
    await testPage.waitForLoadState('networkidle');

    // Check buttons
    const buttons = testPage.locator('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);
    console.log(`✓ Users/Roles: Found ${buttonCount} buttons`);

    // Check button styles consistency
    const primaryButtons = testPage.locator('button.bg-blue-600, button.bg-slate-900, [role="button"][class*="bg-"]');
    const primaryCount = await primaryButtons.count();
    console.log(`✓ Users/Roles: Found ${primaryCount} styled buttons`);

    // Screenshot at desktop
    await testPage.setViewportSize({ width: 1024, height: 768 });
    await testPage.screenshot({ path: '/c/Users/tys/Documents/Coding/GrowChat/audit/02-admin-users-roles-1024.png' });

    // Screenshot at tablet
    await testPage.setViewportSize({ width: 768, height: 1024 });
    await testPage.screenshot({ path: '/c/Users/tys/Documents/Coding/GrowChat/audit/02-admin-users-roles-768.png' });

    // Screenshot at mobile
    await testPage.setViewportSize({ width: 375, height: 667 });
    await testPage.screenshot({ path: '/c/Users/tys/Documents/Coding/GrowChat/audit/02-admin-users-roles-375.png' });
    console.log('✓ Users/Roles screenshots captured at all breakpoints');
  });

  test('4. Admin Settings Models - Form Elements & Spacing', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/admin/settings/models`);
    await testPage.waitForLoadState('networkidle');

    // Check form elements
    const formInputs = testPage.locator('input, textarea, select');
    const inputCount = await formInputs.count();
    console.log(`✓ Settings/Models: Found ${inputCount} form inputs`);

    // Check labels
    const labels = testPage.locator('label');
    const labelCount = await labels.count();
    console.log(`✓ Settings/Models: Found ${labelCount} labels`);

    // Check for spacing consistency
    const containers = testPage.locator('[class*="space-y"], [class*="gap-"]');
    const containerCount = await containers.count();
    console.log(`✓ Settings/Models: Found ${containerCount} containers with spacing`);

    // Screenshot
    await testPage.setViewportSize({ width: 1024, height: 768 });
    await testPage.screenshot({ path: '/c/Users/tys/Documents/Coding/GrowChat/audit/03-admin-settings-models-1024.png' });

    await testPage.setViewportSize({ width: 375, height: 667 });
    await testPage.screenshot({ path: '/c/Users/tys/Documents/Coding/GrowChat/audit/03-admin-settings-models-375.png' });
    console.log('✓ Settings/Models screenshots captured');
  });

  test('5. Admin Settings Connections - Modal/Drawer Consistency', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/admin/settings/connections`);
    await testPage.waitForLoadState('networkidle');

    // Check modal/drawer elements
    const modals = testPage.locator('[role="dialog"], [class*="modal"], [class*="drawer"]');
    const modalCount = await modals.count();
    console.log(`✓ Settings/Connections: Found ${modalCount} modal/drawer elements`);

    // Look for add/edit buttons
    const actionButtons = testPage.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")');
    const actionCount = await actionButtons.count();
    console.log(`✓ Settings/Connections: Found ${actionCount} action buttons`);

    // Screenshot
    await testPage.setViewportSize({ width: 1024, height: 768 });
    await testPage.screenshot({ path: '/c/Users/tys/Documents/Coding/GrowChat/audit/04-admin-settings-connections-1024.png' });
    console.log('✓ Settings/Connections screenshot captured');
  });

  test('6. Admin System General - Typography & Colors', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/admin/system/general`);
    await testPage.waitForLoadState('networkidle');

    // Check headers
    const h1 = testPage.locator('h1');
    const h2 = testPage.locator('h2');
    const h3 = testPage.locator('h3');

    const h1Count = await h1.count();
    const h2Count = await h2.count();
    const h3Count = await h3.count();

    console.log(`✓ System/General: Found H1:${h1Count}, H2:${h2Count}, H3:${h3Count}`);

    // Check text colors
    const textElements = testPage.locator('[class*="text-"]');
    const textCount = await textElements.count();
    console.log(`✓ System/General: Found ${textCount} text elements with color classes`);

    // Screenshot
    await testPage.setViewportSize({ width: 1024, height: 768 });
    await testPage.screenshot({ path: '/c/Users/tys/Documents/Coding/GrowChat/audit/05-admin-system-general-1024.png' });

    await testPage.setViewportSize({ width: 375, height: 667 });
    await testPage.screenshot({ path: '/c/Users/tys/Documents/Coding/GrowChat/audit/05-admin-system-general-375.png' });
    console.log('✓ System/General screenshots captured');
  });

  test('7. Visual Consistency - Button Styles Across Pages', async ({ page: testPage }) => {
    const pages = [
      '/admin/users/overview',
      '/admin/users/roles',
      '/admin/settings/models',
      '/admin/settings/connections',
      '/admin/system/general',
    ];

    for (const pageUrl of pages) {
      await testPage.goto(`${BASE_URL}${pageUrl}`);
      await testPage.waitForLoadState('networkidle');

      // Collect button classes
      const buttons = testPage.locator('button');
      const buttonCount = await buttons.count();

      if (buttonCount > 0) {
        const firstButton = buttons.first();
        const classes = await firstButton.getAttribute('class');
        console.log(`${pageUrl}: First button classes: ${classes?.substring(0, 50)}...`);
      }
    }
  });

  test('8. Responsive Design - Mobile Breakpoint (375px)', async ({ page: testPage }) => {
    await testPage.setViewportSize({ width: 375, height: 667 });

    const pages = [
      '/admin/users/overview',
      '/admin/users/roles',
      '/admin/settings/models',
    ];

    for (const pageUrl of pages) {
      await testPage.goto(`${BASE_URL}${pageUrl}`);
      await testPage.waitForLoadState('networkidle');

      // Check if layout doesn't overflow
      const bodyWidth = await testPage.evaluate(() => document.body.scrollWidth);
      const windowWidth = 375;

      if (bodyWidth > windowWidth) {
        console.warn(`⚠ ${pageUrl}: Body width ${bodyWidth}px exceeds viewport ${windowWidth}px`);
      } else {
        console.log(`✓ ${pageUrl}: Responsive layout OK at 375px`);
      }
    }
  });

  test('9. Responsive Design - Tablet Breakpoint (768px)', async ({ page: testPage }) => {
    await testPage.setViewportSize({ width: 768, height: 1024 });

    const pages = [
      '/admin/users/overview',
      '/admin/users/roles',
      '/admin/settings/models',
    ];

    for (const pageUrl of pages) {
      await testPage.goto(`${BASE_URL}${pageUrl}`);
      await testPage.waitForLoadState('networkidle');

      const bodyWidth = await testPage.evaluate(() => document.body.scrollWidth);
      const windowWidth = 768;

      if (bodyWidth > windowWidth) {
        console.warn(`⚠ ${pageUrl}: Body width ${bodyWidth}px exceeds viewport ${windowWidth}px`);
      } else {
        console.log(`✓ ${pageUrl}: Responsive layout OK at 768px`);
      }
    }
  });

  test('10. Form Element Consistency - Input Fields', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/admin/settings/models`);
    await testPage.waitForLoadState('networkidle');

    // Get all input fields
    const inputs = testPage.locator('input[type="text"], input[type="email"], input[type="password"], textarea');
    const inputCount = await inputs.count();

    console.log(`✓ Settings/Models: Found ${inputCount} input fields`);

    if (inputCount > 0) {
      // Check first input styling
      const firstInput = inputs.first();
      const classes = await firstInput.getAttribute('class');
      const styles = await firstInput.getAttribute('style');

      console.log(`  Input classes: ${classes}`);
      console.log(`  Input styles: ${styles}`);
    }
  });

  test('11. Icon Consistency - Size & Color', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/admin/users/roles`);
    await testPage.waitForLoadState('networkidle');

    // Get all SVG icons
    const icons = testPage.locator('svg');
    const iconCount = await icons.count();
    console.log(`✓ Users/Roles: Found ${iconCount} icons`);

    if (iconCount > 0) {
      // Check icon sizes
      const firstIcon = icons.first();
      const viewBox = await firstIcon.getAttribute('viewBox');
      const classes = await firstIcon.getAttribute('class');

      console.log(`  Icon viewBox: ${viewBox}`);
      console.log(`  Icon classes: ${classes}`);
    }
  });

  test('12. Modal/Dialog Consistency - Styling & Actions', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/admin/settings/connections`);
    await testPage.waitForLoadState('networkidle');

    // Look for modal-related elements
    const dialogs = testPage.locator('[role="dialog"], .modal, .drawer');
    const dialogCount = await dialogs.count();
    console.log(`✓ Settings/Connections: Found ${dialogCount} modal/dialog elements`);

    // Look for action buttons in modals
    const closeButtons = testPage.locator('button:has-text("Close"), button[aria-label*="close"]');
    const closeCount = await closeButtons.count();
    console.log(`✓ Settings/Connections: Found ${closeCount} close buttons`);
  });

  test('13. Table/List Consistency - Row & Cell Styling', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/admin/users/overview`);
    await testPage.waitForLoadState('networkidle');

    // Look for table elements
    const tables = testPage.locator('table');
    const tableCount = await tables.count();
    console.log(`✓ Users/Overview: Found ${tableCount} tables`);

    // Look for list items
    const listItems = testPage.locator('ul > li, [role="listitem"]');
    const listCount = await listItems.count();
    console.log(`✓ Users/Overview: Found ${listCount} list items`);

    if (tableCount > 0) {
      const cells = testPage.locator('table td, table th');
      const cellCount = await cells.count();
      console.log(`✓ Users/Overview: Found ${cellCount} table cells`);
    }
  });

  test('14. Toggle/Switch Consistency', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/admin/settings/general`);
    await testPage.waitForLoadState('networkidle');

    // Look for toggle switches
    const toggles = testPage.locator('[role="switch"], input[type="checkbox"]');
    const toggleCount = await toggles.count();
    console.log(`✓ Settings/General: Found ${toggleCount} toggles/checkboxes`);

    if (toggleCount > 0) {
      const firstToggle = toggles.first();
      const classes = await firstToggle.getAttribute('class');
      console.log(`  Toggle classes: ${classes}`);
    }
  });

  test('15. Color Palette Analysis - Backgrounds', async ({ page: testPage }) => {
    const pages = [
      '/admin/users/overview',
      '/admin/users/roles',
      '/admin/settings/models',
    ];

    const colors = {
      white: 0,
      gray: 0,
      blue: 0,
      red: 0,
      green: 0,
      other: 0,
    };

    for (const pageUrl of pages) {
      await testPage.goto(`${BASE_URL}${pageUrl}`);
      await testPage.waitForLoadState('networkidle');

      // Get elements with bg- classes
      const bgElements = testPage.locator('[class*="bg-"]');
      const count = await bgElements.count();

      if (count > 0) {
        const classes = await bgElements.first().getAttribute('class');
        if (classes?.includes('bg-white')) colors.white++;
        else if (classes?.includes('bg-gray')) colors.gray++;
        else if (classes?.includes('bg-blue')) colors.blue++;
        else if (classes?.includes('bg-red')) colors.red++;
        else if (classes?.includes('bg-green')) colors.green++;
        else colors.other++;
      }
    }

    console.log('✓ Color palette analysis:');
    console.log(`  White backgrounds: ${colors.white}`);
    console.log(`  Gray backgrounds: ${colors.gray}`);
    console.log(`  Blue backgrounds: ${colors.blue}`);
    console.log(`  Red backgrounds: ${colors.red}`);
    console.log(`  Green backgrounds: ${colors.green}`);
    console.log(`  Other: ${colors.other}`);
  });

  test('16. Spacing & Padding Consistency', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/admin/settings/models`);
    await testPage.waitForLoadState('networkidle');

    // Analyze spacing classes
    const spacingElements = testPage.locator('[class*="p-"], [class*="m-"], [class*="space-y-"], [class*="gap-"]');
    const spacingCount = await spacingElements.count();
    console.log(`✓ Settings/Models: Found ${spacingCount} elements with spacing classes`);

    // Get first spacing element
    if (spacingCount > 0) {
      const firstElement = spacingElements.first();
      const classes = await firstElement.getAttribute('class');
      const matches = classes?.match(/(?:p|m|space|gap)-[0-9.]+/g) || [];
      console.log(`  Spacing values found: ${[...new Set(matches)].join(', ')}`);
    }
  });

  test('17. Border & Outline Consistency', async ({ page: testPage }) => {
    await testPage.goto(`${BASE_URL}/admin/users/roles`);
    await testPage.waitForLoadState('networkidle');

    // Get elements with borders
    const bordered = testPage.locator('[class*="border"]');
    const borderCount = await bordered.count();
    console.log(`✓ Users/Roles: Found ${borderCount} elements with borders`);

    // Get elements with outlines
    const outlined = testPage.locator('[class*="outline"], [class*="ring"]');
    const outlineCount = await outlined.count();
    console.log(`✓ Users/Roles: Found ${outlineCount} elements with outlines/rings`);
  });

  test('18. Full Page Screenshots - All Breakpoints', async ({ page: testPage }) => {
    const breakpoints = [
      { width: 375, name: '375-mobile' },
      { width: 768, name: '768-tablet' },
      { width: 1024, name: '1024-desktop' },
    ];

    const pages = [
      '/admin/users/overview',
      '/admin/users/roles',
      '/admin/settings/models',
      '/admin/settings/connections',
      '/admin/system/general',
    ];

    for (const { width, name } of breakpoints) {
      for (const pageUrl of pages) {
        await testPage.setViewportSize({ width, height: 1200 });
        await testPage.goto(`${BASE_URL}${pageUrl}`);
        await testPage.waitForLoadState('networkidle');

        const pageName = pageUrl.replace(/\//g, '-').substring(1);
        await testPage.screenshot({
          path: `/c/Users/tys/Documents/Coding/GrowChat/audit/full-${name}-${pageName}.png`
        });
        console.log(`✓ Screenshot: ${name}-${pageName}`);
      }
    }
  });

  test('19. Accessibility - ARIA Attributes', async ({ page: testPage }) => {
    const pages = [
      '/admin/users/overview',
      '/admin/users/roles',
      '/admin/settings/models',
    ];

    for (const pageUrl of pages) {
      await testPage.goto(`${BASE_URL}${pageUrl}`);
      await testPage.waitForLoadState('networkidle');

      // Check for ARIA labels
      const ariaLabels = testPage.locator('[aria-label], [aria-labelledby]');
      const ariaCount = await ariaLabels.count();

      // Check for roles
      const roles = testPage.locator('[role]');
      const roleCount = await roles.count();

      console.log(`✓ ${pageUrl}: ARIA labels: ${ariaCount}, Roles: ${roleCount}`);
    }
  });

  test('20. Final Consistency Report', async ({ page: testPage }) => {
    console.log('\n=== VISUAL CONSISTENCY AUDIT COMPLETE ===\n');
    console.log('Screenshots saved to: /c/Users/tys/Documents/Coding/GrowChat/audit/\n');
    console.log('Manual review items:');
    console.log('1. Button consistency across all pages');
    console.log('2. Input field border and focus states');
    console.log('3. Modal/drawer backdrop and animation');
    console.log('4. Text hierarchy and font weights');
    console.log('5. Color usage in alerts and status indicators');
    console.log('6. Icon alignment and spacing');
    console.log('7. Mobile navigation accessibility');
    console.log('8. Touch target sizes (min 44x44px)');
    console.log('9. Spacing between sections');
    console.log('10. Table header and row alignment\n');
  });
});
