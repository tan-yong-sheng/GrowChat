import { test, expect } from '@playwright/test';

test.describe('Primary Button Responsiveness', () => {
  test('visual consistency across viewports', async ({ page }) => {
    await page.addStyleTag({ path: 'public/styles.css' });

    await page.setContent(`
      <html>
        <body style="padding: 20px; display: inline-block; background: white;">
          <button class="bg-blue-500 md:bg-green-500 text-white font-bold py-2 md:py-4 px-4 md:px-8 rounded">
            Click Me
          </button>
        </body>
      </html>
    `);

    const button = page.locator('button');

    await page.setViewportSize({ width: 375, height: 200 });
    await expect(button).toHaveScreenshot('primary-button-mobile.png');

    await page.setViewportSize({ width: 1280, height: 240 });
    await expect(button).toHaveScreenshot('primary-button-desktop.png');
  });
});
