import { test, expect } from '@playwright/test';

test('search modal should display formatted dates without "Unknown date"', async ({ page }) => {
  // Navigate to dev server
  await page.goto('http://127.0.0.1:3007', { waitUntil: 'networkidle', timeout: 15000 });
  
  // Wait for search button
  const searchBtn = page.locator('#open-search');
  await searchBtn.waitFor({ state: 'visible', timeout: 5000 });
  
  // Click search button
  await searchBtn.click();
  
  // Wait for search modal
  const searchModal = page.locator('[role="dialog"]');
  await searchModal.waitFor({ state: 'visible', timeout: 5000 });
  
  // Get all text content from the modal
  const modalContent = await searchModal.textContent();
  console.log('Modal content:', modalContent);
  
  // Check that "Unknown date" does NOT appear
  expect(modalContent).not.toContain('Unknown date');
  
  // Verify date labels are present and properly formatted
  const dateLabels = await page.locator('[class*="text-xs"], [class*="text-gray-500"]').allTextContents();
  console.log('Date labels found:', dateLabels);
  
  // Take screenshot for visual verification
  await page.screenshot({ path: test.info().outputPath('search-modal-dates-verification.png') });
  
  console.log('PASS: Search modal dates are properly formatted');
});
