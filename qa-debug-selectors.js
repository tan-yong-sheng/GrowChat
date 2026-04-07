import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:8787';
const TEST_EMAIL = 'tys203831@gmail.com';
const TEST_PASSWORD = '&Test1234';

async function debugSelectors() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🔍 Finding correct selectors...\n');

    // Login
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');
    
    const emailInput = await page.$('#email');
    const passwordInput = await page.$('#password');
    const submitBtn = await page.$('#auth-submit');

    if (emailInput && passwordInput && submitBtn) {
      await emailInput.fill(TEST_EMAIL);
      await passwordInput.fill(TEST_PASSWORD);
      await submitBtn.click();
      
      try {
        await page.waitForNavigation({ timeout: 5000 });
      } catch (e) {}
      
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Find message input
      console.log('📝 Message Input Selectors:');
      const messageInputs = await page.evaluate(() => {
        const results = [];
        
        // Check textarea
        const textarea = document.querySelector('textarea');
        if (textarea) {
          results.push({
            type: 'textarea',
            selector: 'textarea',
            placeholder: textarea.getAttribute('placeholder'),
            id: textarea.getAttribute('id'),
            class: textarea.getAttribute('class')
          });
        }

        // Check contenteditable
        const contenteditable = document.querySelector('[contenteditable="true"]');
        if (contenteditable) {
          results.push({
            type: 'contenteditable',
            selector: '[contenteditable="true"]',
            id: contenteditable.getAttribute('id'),
            class: contenteditable.getAttribute('class')
          });
        }

        // Check input[type="text"]
        const textInputs = document.querySelectorAll('input[type="text"]');
        textInputs.forEach((input, idx) => {
          if (input.offsetParent !== null) { // visible
            results.push({
              type: 'input[type="text"]',
              selector: `input[type="text"]:nth-of-type(${idx + 1})`,
              placeholder: input.getAttribute('placeholder'),
              id: input.getAttribute('id'),
              class: input.getAttribute('class')
            });
          }
        });

        return results;
      });

      messageInputs.forEach(input => {
        console.log(`  ${input.type}: ${input.selector}`);
        if (input.placeholder) console.log(`    placeholder: "${input.placeholder}"`);
        if (input.id) console.log(`    id: "${input.id}"`);
      });

      // Find user profile menu
      console.log('\n👤 User Profile Menu Selectors:');
      const userMenus = await page.evaluate(() => {
        const results = [];

        // Check for buttons with user-related aria-labels
        const buttons = document.querySelectorAll('button');
        buttons.forEach((btn, idx) => {
          const ariaLabel = btn.getAttribute('aria-label');
          const text = btn.textContent?.trim();
          const id = btn.getAttribute('id');
          
          if ((ariaLabel && (ariaLabel.toLowerCase().includes('user') || ariaLabel.toLowerCase().includes('profile'))) ||
              (text && (text.toLowerCase().includes('user') || text.toLowerCase().includes('profile'))) ||
              (id && (id.toLowerCase().includes('user') || id.toLowerCase().includes('profile')))) {
            results.push({
              type: 'button',
              id: id,
              ariaLabel: ariaLabel,
              text: text?.substring(0, 50),
              class: btn.getAttribute('class')
            });
          }
        });

        // Check for divs with user-related classes
        const divs = document.querySelectorAll('div[class*="user"], div[class*="profile"]');
        divs.forEach((div, idx) => {
          if (div.offsetParent !== null && idx < 3) { // visible, limit to 3
            results.push({
              type: 'div',
              class: div.getAttribute('class'),
              id: div.getAttribute('id')
            });
          }
        });

        return results;
      });

      userMenus.forEach(menu => {
        console.log(`  ${menu.type}:`);
        if (menu.id) console.log(`    id: "${menu.id}"`);
        if (menu.ariaLabel) console.log(`    aria-label: "${menu.ariaLabel}"`);
        if (menu.text) console.log(`    text: "${menu.text}"`);
        if (menu.class) console.log(`    class: "${menu.class}"`);
      });

      // Check footer area for user profile
      console.log('\n🔎 Footer/Bottom Area Elements:');
      const footerElements = await page.evaluate(() => {
        const results = [];
        
        // Look for footer
        const footer = document.querySelector('footer');
        if (footer) {
          results.push({
            type: 'footer',
            class: footer.getAttribute('class'),
            children: footer.children.length
          });
        }

        // Look for elements at bottom of sidebar
        const sidebar = document.querySelector('#sidebar');
        if (sidebar) {
          const lastChild = sidebar.lastElementChild;
          if (lastChild) {
            results.push({
              type: 'sidebar last child',
              class: lastChild.getAttribute('class'),
              id: lastChild.getAttribute('id'),
              html: lastChild.outerHTML.substring(0, 100)
            });
          }
        }

        return results;
      });

      footerElements.forEach(el => {
        console.log(`  ${el.type}:`);
        if (el.class) console.log(`    class: "${el.class}"`);
        if (el.id) console.log(`    id: "${el.id}"`);
        if (el.children) console.log(`    children: ${el.children}`);
      });
    }

    await browser.close();

  } catch (error) {
    console.error('Error:', error.message);
    await browser.close();
  }
}

debugSelectors();
