import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:8787';
const TEST_EMAIL = 'tys203831@gmail.com';
const TEST_PASSWORD = '&Test1234';

async function verifySidebarToggle() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Login
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');

    const emailInput = await page.$('#email');
    const passwordInput = await page.$('#password');
    const submitBtn = await page.$('#auth-submit');

    await emailInput.fill(TEST_EMAIL);
    await passwordInput.fill(TEST_PASSWORD);
    await submitBtn.click();

    try {
      await page.waitForNavigation({ timeout: 5000 });
    } catch (e) {}

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const toggleBtn = await page.$('#toggle-sidebar-desktop');
    
    if (toggleBtn) {
      console.log('Toggle button found');

      // Before click
      const beforeClass = await page.evaluate(() => {
        const sidebar = document.querySelector('#sidebar');
        return {
          classList: Array.from(sidebar.classList),
          marginLeft: window.getComputedStyle(sidebar).marginLeft
        };
      });
      console.log('Before toggle:', beforeClass);

      // Click toggle
      await toggleBtn.click();
      await page.waitForTimeout(500);

      // After click
      const afterClass = await page.evaluate(() => {
        const sidebar = document.querySelector('#sidebar');
        return {
          classList: Array.from(sidebar.classList),
          marginLeft: window.getComputedStyle(sidebar).marginLeft
        };
      });
      console.log('After toggle:', afterClass);

      console.log('Class changed:', beforeClass.classList.sort().join(',') !== afterClass.classList.sort().join(','));
      console.log('Margin changed:', beforeClass.marginLeft !== afterClass.marginLeft);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

verifySidebarToggle();
