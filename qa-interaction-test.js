import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8787';
const FINDINGS_DIR = './docs/qa/findings';

if (!fs.existsSync(FINDINGS_DIR)) {
  fs.mkdirSync(FINDINGS_DIR, { recursive: true });
}

async function interactionEdgeCaseTest() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings = {
    timestamp: new Date().toISOString(),
    issues: [],
    tests: []
  };

  try {
    console.log('🧪 Testing user interactions and edge cases...\n');

    // Test 1: Sidebar collapse/expand on desktop
    console.log('📋 Test 1: Sidebar collapse/expand functionality...');
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const sidebar = await page.$('#sidebar');
    const toggleBtn = await page.$('#toggle-sidebar-desktop');

    if (toggleBtn && sidebar) {
      const initialMargin = await sidebar.evaluate(el => window.getComputedStyle(el).marginLeft);
      await toggleBtn.click();
      await page.waitForTimeout(300);
      const afterClickMargin = await sidebar.evaluate(el => window.getComputedStyle(el).marginLeft);

      const sidebarToggled = initialMargin !== afterClickMargin;
      findings.tests.push({
        name: 'Sidebar toggle',
        passed: sidebarToggled,
        details: sidebarToggled ? 'Sidebar toggles correctly' : 'Sidebar did not toggle'
      });

      if (!sidebarToggled) {
        findings.issues.push({
          severity: 'HIGH',
          type: 'Sidebar toggle broken',
          page: '/',
          details: 'Sidebar toggle button does not collapse/expand sidebar'
        });
      }
    }

    // Test 2: Search modal open/close
    console.log('📋 Test 2: Search modal functionality...');
    const searchBtn = await page.$('#open-search');
    if (searchBtn) {
      await searchBtn.click();
      await page.waitForTimeout(300);

      const searchModal = await page.$('[role="dialog"]');
      const modalVisible = searchModal && await searchModal.isVisible();

      findings.tests.push({
        name: 'Search modal opens',
        passed: !!modalVisible,
        details: modalVisible ? 'Modal opens' : 'Modal did not open'
      });

      if (modalVisible) {
        // Try to close it
        const closeBtn = await page.$('[aria-label="Close"]');
        if (closeBtn) {
          await closeBtn.click();
          await page.waitForTimeout(300);
          const stillVisible = await searchModal.isVisible().catch(() => false);
          findings.tests.push({
            name: 'Search modal closes',
            passed: !stillVisible,
            details: !stillVisible ? 'Modal closes' : 'Modal did not close'
          });
        }
      }
    }

    // Test 3: New chat button
    console.log('📋 Test 3: New chat button functionality...');
    const newChatBtn = await page.$('#new-chat');
    if (newChatBtn) {
      const isVisible = await newChatBtn.isVisible();
      const isEnabled = !await newChatBtn.getAttribute('disabled');

      findings.tests.push({
        name: 'New chat button',
        passed: isVisible && isEnabled,
        details: `Visible: ${isVisible}, Enabled: ${isEnabled}`
      });
    }

    // Test 4: Responsive sidebar on mobile
    console.log('📋 Test 4: Mobile sidebar behavior...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const mobileSidebar = await page.$('#sidebar');
    const mobileToggle = await page.$('#toggle-sidebar-mobile');

    if (mobileSidebar && mobileToggle) {
      const isToggleVisible = await mobileToggle.isVisible();
      findings.tests.push({
        name: 'Mobile sidebar toggle visible',
        passed: isToggleVisible,
        details: isToggleVisible ? 'Toggle visible on mobile' : 'Toggle not visible'
      });
    }

    // Test 5: Viewport meta tag
    console.log('📋 Test 5: Viewport meta tag...');
    const viewportMeta = await page.$('meta[name="viewport"]');
    findings.tests.push({
      name: 'Viewport meta tag',
      passed: !!viewportMeta,
      details: viewportMeta ? 'Present' : 'Missing'
    });

    // Test 6: Lang attribute
    console.log('📋 Test 6: HTML lang attribute...');
    const htmlLang = await page.evaluate(() => document.documentElement.getAttribute('lang'));
    findings.tests.push({
      name: 'HTML lang attribute',
      passed: !!htmlLang,
      details: htmlLang ? `lang="${htmlLang}"` : 'Missing'
    });

    // Test 7: Focus management
    console.log('📋 Test 7: Focus management...');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tagName: el?.tagName,
        id: el?.id,
        class: el?.className
      };
    });

    findings.tests.push({
      name: 'Keyboard focus management',
      passed: !!focusedElement.tagName,
      details: focusedElement.tagName ? `Focused on ${focusedElement.tagName}` : 'No focus'
    });

    // Summary
    console.log('\n\n📊 Interaction Test Results:');
    const totalTests = findings.tests.length;
    const passedTests = findings.tests.filter(t => t.passed).length;
    console.log(`  Total: ${totalTests}`);
    console.log(`  Passed: ${passedTests}`);
    console.log(`  Failed: ${totalTests - passedTests}`);

    findings.tests.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      console.log(`  ${status} ${test.name}: ${test.details}`);
    });

    if (findings.issues.length > 0) {
      console.log(`\n⚠️ Issues Found: ${findings.issues.length}`);
      findings.issues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. [${issue.severity}] ${issue.type}`);
        console.log(`     ${issue.details}`);
      });
    }

    // Save report
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = path.join(FINDINGS_DIR, `interaction-test-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));

    console.log(`\n✅ Report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

interactionEdgeCaseTest();
