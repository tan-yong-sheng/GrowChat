import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  const baseUrl = process.env.APP_URL || process.env.TEST_URL || 'http://localhost:8787';
  
  try {
    console.log('Navigating to auth page...');
    await page.goto(`${baseUrl}/auth.html`);
    
    console.log('Logging in...');
    await page.fill('#email', 'admin@localhost');
    await page.fill('#password', 'admin123');
    await page.click('#auth-submit');
    
    // Wait for redirect to home
    await page.waitForURL(`${baseUrl}/`);
    console.log('Logged in successfully.');
    
    // Navigate to admin
    console.log('Navigating to admin...');
    // The admin page route might be /admin, but let's click the UI elements or go directly.
    await page.goto(`${baseUrl}/admin`);
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of admin overview
    await page.screenshot({ path: 'admin-overview.png', fullPage: true });
    console.log('Screenshot saved to admin-overview.png');
    
    // Navigate to system/audit if it exists or just settings
    await page.goto(`${baseUrl}/admin/system/audit`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'admin-audit.png', fullPage: true });
    console.log('Screenshot saved to admin-audit.png');
    
  } catch (error) {
    console.error('Error during Playwright execution:', error);
  } finally {
    await browser.close();
  }
})();
