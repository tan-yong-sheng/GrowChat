import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:8787';

async function verifyAriaLabels() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🔍 Verifying ARIA label fixes in rendered DOM...\n');

    // Navigate to main page
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check sidebar toggle button for aria-label in rendered DOM
    const sidebarToggle = await page.$('#toggle-sidebar-desktop');
    if (sidebarToggle) {
      const ariaLabel = await sidebarToggle.getAttribute('aria-label');
      console.log(`✅ Sidebar toggle button aria-label: "${ariaLabel}"`);
    } else {
      console.log(`❌ Sidebar toggle button not found`);
    }

    // Check chat menu buttons for aria-label in rendered DOM
    const chatMenuButtons = await page.$$('.chat-menu-btn');
    if (chatMenuButtons.length > 0) {
      console.log(`\n📋 Found ${chatMenuButtons.length} chat menu buttons:`);
      for (let i = 0; i < Math.min(3, chatMenuButtons.length); i++) {
        const btn = chatMenuButtons[i];
        const ariaLabel = await btn.getAttribute('aria-label');
        console.log(`  Button ${i + 1}: aria-label="${ariaLabel}"`);
      }
    } else {
      console.log('ℹ️ No chat menu buttons found on current view (may need to hover over chat)');
    }

    // Run full accessibility audit on all buttons in rendered DOM
    console.log('\n\n♿ Full accessibility audit of all buttons in rendered DOM:');
    const allButtons = await page.$$('button');
    let totalButtons = allButtons.length;
    let labeledButtons = 0;
    let unlabeledButtons = [];

    for (let i = 0; i < allButtons.length; i++) {
      const btn = allButtons[i];
      const ariaLabel = await btn.getAttribute('aria-label');
      const textContent = (await btn.textContent()).trim();

      // Consider a button labeled if it has aria-label or visible text
      const isLabeled = (ariaLabel && ariaLabel.trim().length > 0) || textContent.length > 0;

      if (!isLabeled) {
        const btnClass = await btn.getAttribute('class');
        unlabeledButtons.push({
          index: i,
          class: btnClass,
          visible: await btn.isVisible()
        });
      } else {
        labeledButtons++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`  Total buttons: ${totalButtons}`);
    console.log(`  Labeled buttons: ${labeledButtons}`);
    console.log(`  Unlabeled buttons: ${unlabeledButtons.length}`);

    if (unlabeledButtons.length > 0) {
      console.log(`\n⚠️ Unlabeled buttons found:`);
      unlabeledButtons.slice(0, 5).forEach((btn, idx) => {
        console.log(`  ${idx + 1}. Index=${btn.index}, Class="${btn.class}", Visible=${btn.visible}`);
      });
    } else {
      console.log('\n✅ All buttons have proper labels!');
    }

  } catch (error) {
    console.error('❌ Error during verification:', error);
  } finally {
    await browser.close();
  }
}

verifyAriaLabels();


