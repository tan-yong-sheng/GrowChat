import { test, expect } from '@playwright/test';

test.describe('Search Placeholder Text Contrast Verification', () => {
  test('verify search modal renders with placeholder:text-gray-600 class', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Create a test container and render the search modal
    await page.evaluate(async () => {
      // Create container
      const container = document.createElement('div');
      container.id = 'test-search-modal-container';
      document.body.appendChild(container);

      // Dynamically import and render the search modal
      try {
        const module = await import('/js/shared/components/search-modal.js');
        const { renderSearchModal } = module;

        // Render with dummy functions
        renderSearchModal(container, () => {}, () => {});
      } catch (error) {
        console.error('Failed to render search modal:', error);
      }
    });

    // Get the search input element (may be hidden)
    const searchInput = page.locator('#modal-search-input');

    // Wait for the element to be in the DOM (not necessarily visible)
    await searchInput.first().waitFor({ state: 'attached', timeout: 5000 });

    // Verify the input exists in the DOM
    const count = await searchInput.count();
    expect(count).toBeGreaterThan(0);
    console.log('✓ Search input element found in DOM');

    // Verify the placeholder text
    const placeholderText = await searchInput.getAttribute('placeholder');
    expect(placeholderText).toBe('Search chats...');
    console.log('✓ Placeholder text verified: "Search chats..."');

    // Check the class contains placeholder:text-gray-600
    const classList = await searchInput.getAttribute('class');
    console.log('Input classes:', classList);
    expect(classList).toContain('placeholder:text-gray-600');
    console.log('✓ Placeholder contrast class verified: placeholder:text-gray-600');

    // Verify the old gray-500 class is NOT present
    const hasOldClass = classList?.includes('placeholder:text-gray-500');
    expect(hasOldClass).toBe(false);
    console.log('✓ Old placeholder:text-gray-500 class has been removed');

    // Make the modal visible for screenshot
    await page.evaluate(() => {
      const modal = document.getElementById('modal-root');
      if (modal) {
        modal.style.display = 'block';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
      }
    });

    // Take a screenshot to visually verify contrast
    await page.screenshot({ path: test.info().outputPath('search-placeholder-contrast.png') });
    console.log('✓ Screenshot saved: search-placeholder-contrast.png');

    // Verify the placeholder is readable
    const isContrastImproved = classList?.includes('placeholder:text-gray-600');
    expect(isContrastImproved).toBe(true);

    console.log('✓ Search placeholder text contrast verified: gray-600 applied');
    console.log('✓ Contrast improvement: Changed from gray-500 to gray-600 for better readability');
  });

  test('verify search-modal.js source contains correct placeholder class', async ({ page }) => {
    // Fetch the search-modal.js file
    const response = await page.goto('/js/shared/components/search-modal.js');
    const content = await response?.text();

    // Verify the placeholder:text-gray-600 class is present in source
    expect(content).toContain('placeholder:text-gray-600');
    console.log('✓ Source file contains placeholder:text-gray-600 class');

    // Verify the placeholder text is correct
    expect(content).toContain('placeholder="Search chats..."');
    console.log('✓ Source file has correct placeholder text: "Search chats..."');

    // Verify it's NOT using the old gray-500
    const hasOldClass = content?.includes('placeholder:text-gray-500');
    expect(hasOldClass).toBe(false);
    console.log('✓ Old placeholder:text-gray-500 class has been removed from source');
  });
});
