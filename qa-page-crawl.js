import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8787';
const FINDINGS_DIR = './docs/qa/findings';

if (!fs.existsSync(FINDINGS_DIR)) {
  fs.mkdirSync(FINDINGS_DIR, { recursive: true });
}

async function comprehensivePageTest() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const findings = {
    timestamp: new Date().toISOString(),
    issues: [],
    tests: [],
    pagesCrawled: []
  };

  const pagesToTest = [
    { url: '/', name: 'Chat Home' },
    { url: '/admin/users/overview', name: 'Admin Users' },
    { url: '/admin/system/general', name: 'Admin System' },
    { url: '/admin/settings/connections', name: 'Admin Connections' },
    { url: '/admin/settings/models', name: 'Admin Models' },
    { url: '/admin/settings/security', name: 'Admin Security' },
  ];

  try {
    console.log('🧪 Running comprehensive page crawl test...\n');

    for (const pageConfig of pagesToTest) {
      console.log(`📄 Testing: ${pageConfig.name} (${pageConfig.url})`);

      try {
        await page.goto(`${BASE_URL}${pageConfig.url}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        // Check for console errors
        const consoleErrors = [];
        const consoleWarnings = [];

        page.removeAllListeners('console');
        page.on('console', msg => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
          if (msg.type() === 'warning') consoleWarnings.push(msg.text());
        });

        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        // Check for broken images
        const images = await page.$$('img');
        const brokenImages = [];
        for (const img of images) {
          const src = await img.getAttribute('src');
          const alt = await img.getAttribute('alt');
          if (src && !src.includes('data:') && !alt) {
            brokenImages.push({ src, hasAlt: !!alt });
          }
        }

        // Check for buttons without accessible names
        const buttons = await page.$$('button');
        const inaccessibleButtons = [];
        for (const btn of buttons) {
          const ariaLabel = await btn.getAttribute('aria-label');
          const title = await btn.getAttribute('title');
          const text = await btn.textContent();
          const hasAccessibleName = ariaLabel || title || (text && text.trim());

          if (!hasAccessibleName) {
            inaccessibleButtons.push({
              class: await btn.getAttribute('class'),
              type: await btn.getAttribute('type')
            });
          }
        }

        // Check for links without text
        const links = await page.$$('a');
        const inaccessibleLinks = [];
        for (const link of links) {
          const ariaLabel = await link.getAttribute('aria-label');
          const title = await link.getAttribute('title');
          const text = await link.textContent();
          const hasAccessibleName = ariaLabel || title || (text && text.trim());

          if (!hasAccessibleName) {
            inaccessibleLinks.push({
              href: await link.getAttribute('href'),
              class: await link.getAttribute('class')
            });
          }
        }

        findings.pagesCrawled.push({
          url: pageConfig.url,
          name: pageConfig.name,
          consoleErrors: consoleErrors.length,
          consoleWarnings: consoleWarnings.length,
          brokenImages: brokenImages.length,
          inaccessibleButtons: inaccessibleButtons.length,
          inaccessibleLinks: inaccessibleLinks.length
        });

        if (consoleErrors.length > 0) {
          findings.issues.push({
            severity: 'HIGH',
            type: 'Console errors',
            page: pageConfig.url,
            details: `${consoleErrors.length} console errors detected`
          });
        }

        if (brokenImages.length > 0) {
          findings.issues.push({
            severity: 'MEDIUM',
            type: 'Images without alt text',
            page: pageConfig.url,
            details: `${brokenImages.length} images lack alt text`
          });
        }

        if (inaccessibleButtons.length > 0) {
          findings.issues.push({
            severity: 'MEDIUM',
            type: 'Inaccessible buttons',
            page: pageConfig.url,
            details: `${inaccessibleButtons.length} buttons lack accessible names`
          });
        }

        if (inaccessibleLinks.length > 0) {
          findings.issues.push({
            severity: 'MEDIUM',
            type: 'Inaccessible links',
            page: pageConfig.url,
            details: `${inaccessibleLinks.length} links lack accessible names`
          });
        }

        console.log(`  ✅ Crawled successfully`);
        console.log(`     Errors: ${consoleErrors.length}, Warnings: ${consoleWarnings.length}`);
        console.log(`     Broken images: ${brokenImages.length}, Inaccessible buttons: ${inaccessibleButtons.length}`);

      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        findings.issues.push({
          severity: 'HIGH',
          type: 'Page load error',
          page: pageConfig.url,
          details: error.message
        });
      }
    }

    // Summary
    console.log('\n\n📊 Crawl Summary:');
    console.log(`  Pages tested: ${findings.pagesCrawled.length}`);
    console.log(`  Issues found: ${findings.issues.length}`);

    findings.pagesCrawled.forEach(p => {
      console.log(`  ${p.name}: ${p.consoleErrors} errors, ${p.inaccessibleButtons} inaccessible buttons`);
    });

    if (findings.issues.length > 0) {
      console.log(`\n⚠️ Issues by severity:`);
      const bySeverity = {};
      findings.issues.forEach(issue => {
        bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
      });
      Object.entries(bySeverity).forEach(([severity, count]) => {
        console.log(`  ${severity}: ${count}`);
      });
    }

    // Save report
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = path.join(FINDINGS_DIR, `page-crawl-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));

    console.log(`\n✅ Report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
  } finally {
    await browser.close();
  }
}

comprehensivePageTest();
