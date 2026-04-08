import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:8787';
const EMAIL = 'tys203831@gmail.com';
const PASSWORD = '&Test1234';

const PAGES_TO_TEST = [
  { path: '/admin/users/overview', name: 'Users Overview' },
  { path: '/admin/settings/models', name: 'Settings - Models' },
  { path: '/admin/system/general', name: 'System - General' },
];

class AccessibilityAuditor {
  constructor() {
    this.results = [];
    this.issues = [];
  }

  async login(page) {
    console.log('Logging in...');
    await page.goto(`${BASE_URL}/auth.html`);
    await page.waitForLoadState('networkidle');

    // Wait for auth page to load
    await page.waitForSelector('#email', { timeout: 10000 });

    // Fill in email and password
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);

    // Click the auth submit button (not the forgot password one)
    await page.click('#auth-submit');

    // Wait for navigation to admin or home page
    await page.waitForURL(/\/(admin|index\.html|$)/, { timeout: 15000 });

    console.log('Login successful');
  }

  async checkAriaLabels(page, pageName) {
    console.log(`\n[${pageName}] Checking ARIA labels...`);

    const unlabeledElements = await page.evaluate(() => {
      const issues = [];
      const interactiveElements = document.querySelectorAll('button, [role="button"], input, select, textarea, [role="switch"], [role="tab"]');

      interactiveElements.forEach((el) => {
        if (el.offsetParent === null) return;

        const hasAriaLabel = el.getAttribute('aria-label');
        const hasAriaLabelledBy = el.getAttribute('aria-labelledby');
        const hasTitle = el.getAttribute('title');
        const hasTextContent = el.textContent?.trim();
        const hasLabel = el.closest('label') || document.querySelector(`label[for="${el.id}"]`);

        if (!hasAriaLabel && !hasAriaLabelledBy && !hasLabel && !hasTextContent && !hasTitle) {
          issues.push({
            type: 'Missing ARIA Label',
            element: el.outerHTML.substring(0, 100),
            role: el.getAttribute('role') || el.tagName,
            selector: el.id || el.className || 'no-selector'
          });
        }
      });

      return issues;
    });

    if (unlabeledElements.length > 0) {
      this.issues.push({
        page: pageName,
        check: 'ARIA Labels',
        priority: 'HIGH',
        count: unlabeledElements.length,
        details: unlabeledElements.slice(0, 5)
      });
    }

    return unlabeledElements;
  }

  async checkKeyboardNavigation(page, pageName) {
    console.log(`[${pageName}] Checking keyboard navigation...`);

    const keyboardIssues = await page.evaluate(() => {
      const issues = [];
      const interactiveElements = document.querySelectorAll('button, [role="button"], input, select, textarea, [role="switch"], a[href], [tabindex]');

      interactiveElements.forEach((el) => {
        if (el.offsetParent === null) return;

        const tabindex = el.getAttribute('tabindex');
        const isDisabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';

        if (isDisabled && el.getAttribute('tabindex') !== '-1') {
          if (!['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
            issues.push({
              type: 'Disabled element still focusable',
              element: el.outerHTML.substring(0, 100),
              role: el.getAttribute('role') || el.tagName
            });
          }
        }
      });

      return issues;
    });

    if (keyboardIssues.length > 0) {
      this.issues.push({
        page: pageName,
        check: 'Keyboard Navigation',
        priority: 'HIGH',
        count: keyboardIssues.length,
        details: keyboardIssues.slice(0, 5)
      });
    }

    return keyboardIssues;
  }

  async checkColorContrast(page, pageName) {
    console.log(`[${pageName}] Checking color contrast...`);

    const contrastIssues = await page.evaluate(() => {
      const issues = [];

      const parseRgb = (rgb) => {
        const match = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
          return {
            r: parseInt(match[1]),
            g: parseInt(match[2]),
            b: parseInt(match[3])
          };
        }
        return null;
      };

      const calculateLuminance = (rgb) => {
        if (!rgb) return 0;
        const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(val => {
          val = val / 255;
          return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };

      const getComputedContrast = (element) => {
        const style = window.getComputedStyle(element);
        const bgColor = style.backgroundColor;
        const color = style.color;

        const bg = parseRgb(bgColor);
        const fg = parseRgb(color);

        if (!bg || !fg) return null;

        const l1 = calculateLuminance(fg);
        const l2 = calculateLuminance(bg);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);

        return (lighter + 0.05) / (darker + 0.05);
      };

      const textElements = document.querySelectorAll('button, label, p, span, a, input, select');
      textElements.forEach((el) => {
        if (el.offsetParent === null || !el.textContent?.trim()) return;

        const contrast = getComputedContrast(el);
        if (contrast && contrast < 4.5) {
          issues.push({
            type: 'Low contrast',
            contrast: contrast.toFixed(2),
            text: el.textContent.substring(0, 50),
            role: el.getAttribute('role') || el.tagName
          });
        }
      });

      return issues;
    });

    if (contrastIssues.length > 0) {
      this.issues.push({
        page: pageName,
        check: 'Color Contrast',
        priority: 'HIGH',
        count: contrastIssues.length,
        details: contrastIssues.slice(0, 5)
      });
    }

    return contrastIssues;
  }

  async checkScreenReaderText(page, pageName) {
    console.log(`[${pageName}] Checking screen reader compatibility...`);

    const srIssues = await page.evaluate(() => {
      const issues = [];

      const ariaHiddenElements = document.querySelectorAll('[aria-hidden="true"]');
      ariaHiddenElements.forEach((el) => {
        if (el.offsetParent === null) return;

        const hasText = el.textContent?.trim().length > 0;
        const hasAriaLabel = el.getAttribute('aria-label');
        const isIcon = el.classList.toString().includes('icon') || el.tagName === 'SVG';

        if (hasText && !hasAriaLabel && !isIcon) {
          issues.push({
            type: 'aria-hidden with hidden text',
            text: el.textContent.substring(0, 50),
            element: el.outerHTML.substring(0, 100)
          });
        }
      });

      return issues;
    });

    if (srIssues.length > 0) {
      this.issues.push({
        page: pageName,
        check: 'Screen Reader Text',
        priority: 'HIGH',
        count: srIssues.length,
        details: srIssues.slice(0, 5)
      });
    }

    return srIssues;
  }

  async checkFormValidation(page, pageName) {
    console.log(`[${pageName}] Checking form validation messages...`);

    const formIssues = await page.evaluate(() => {
      const issues = [];
      const inputs = document.querySelectorAll('input, select, textarea');

      inputs.forEach((input) => {
        if (input.offsetParent === null) return;

        const hasAriaDescribedBy = input.getAttribute('aria-describedby');
        const hasValidationAttr = input.hasAttribute('required') || input.hasAttribute('aria-invalid');

        if (hasValidationAttr && !hasAriaDescribedBy) {
          issues.push({
            type: 'Missing error message association',
            input: input.id || input.name || 'unnamed',
            validation: hasValidationAttr
          });
        }
      });

      return issues;
    });

    if (formIssues.length > 0) {
      this.issues.push({
        page: pageName,
        check: 'Form Validation',
        priority: 'MEDIUM',
        count: formIssues.length,
        details: formIssues.slice(0, 5)
      });
    }

    return formIssues;
  }

  async checkButtonStates(page, pageName) {
    console.log(`[${pageName}] Checking button states...`);

    const buttonIssues = await page.evaluate(() => {
      const issues = [];
      const buttons = document.querySelectorAll('button, [role="button"]');

      buttons.forEach((btn) => {
        if (btn.offsetParent === null) return;

        const style = window.getComputedStyle(btn);
        const hasFocusVisibility = style.outline !== 'none' || style.boxShadow !== 'none';

        if (!hasFocusVisibility && !btn.className.includes('focus')) {
          issues.push({
            type: 'No visible focus indicator',
            button: btn.textContent.substring(0, 50),
            class: btn.className.substring(0, 100)
          });
        }

        if (btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true') {
          const opacity = style.opacity;
          const cursor = style.cursor;

          if (opacity !== '1' && cursor === 'pointer') {
            issues.push({
              type: 'Disabled state unclear - cursor still pointer',
              button: btn.textContent.substring(0, 50)
            });
          }
        }
      });

      return issues;
    });

    if (buttonIssues.length > 0) {
      this.issues.push({
        page: pageName,
        check: 'Button States',
        priority: 'MEDIUM',
        count: buttonIssues.length,
        details: buttonIssues.slice(0, 5)
      });
    }

    return buttonIssues;
  }

  async checkToggleAccessibility(page, pageName) {
    console.log(`[${pageName}] Checking toggle/switch accessibility...`);

    const toggleIssues = await page.evaluate(() => {
      const issues = [];
      const toggles = document.querySelectorAll('[role="switch"], .toggle, [data-toggle], [class*="toggle"]');

      toggles.forEach((toggle) => {
        if (toggle.offsetParent === null) return;

        const hasRole = toggle.getAttribute('role') === 'switch';
        const hasAriaChecked = toggle.getAttribute('aria-checked');
        const hasAriaLabel = toggle.getAttribute('aria-label');

        if (!hasRole) {
          issues.push({
            type: 'Missing or incorrect role',
            element: toggle.outerHTML.substring(0, 100),
            role: toggle.getAttribute('role')
          });
        }

        if (hasRole && !hasAriaChecked) {
          issues.push({
            type: 'Missing aria-checked on switch',
            element: toggle.outerHTML.substring(0, 100)
          });
        }

        if (!hasAriaLabel) {
          issues.push({
            type: 'Missing aria-label on toggle',
            element: toggle.outerHTML.substring(0, 100)
          });
        }
      });

      return issues;
    });

    if (toggleIssues.length > 0) {
      this.issues.push({
        page: pageName,
        check: 'Toggle/Switch Accessibility',
        priority: 'MEDIUM',
        count: toggleIssues.length,
        details: toggleIssues.slice(0, 5)
      });
    }

    return toggleIssues;
  }

  async testPage(browser, pageConfig) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${pageConfig.name}`);
    console.log(`Path: ${pageConfig.path}`);
    console.log('='.repeat(60));

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await this.login(page);
      await page.goto(`${BASE_URL}${pageConfig.path}`);
      await page.waitForLoadState('networkidle');

      const ariaResults = await this.checkAriaLabels(page, pageConfig.name);
      const keyboardResults = await this.checkKeyboardNavigation(page, pageConfig.name);
      const contrastResults = await this.checkColorContrast(page, pageConfig.name);
      const srResults = await this.checkScreenReaderText(page, pageConfig.name);
      const formResults = await this.checkFormValidation(page, pageConfig.name);
      const buttonResults = await this.checkButtonStates(page, pageConfig.name);
      const toggleResults = await this.checkToggleAccessibility(page, pageConfig.name);

      this.results.push({
        page: pageConfig.name,
        path: pageConfig.path,
        checks: {
          ariaLabels: ariaResults.length,
          keyboardNavigation: keyboardResults.length,
          colorContrast: contrastResults.length,
          screenReaderText: srResults.length,
          formValidation: formResults.length,
          buttonStates: buttonResults.length,
          toggleAccessibility: toggleResults.length
        }
      });

    } catch (err) {
      console.error(`Error testing ${pageConfig.name}:`, err.message);
    } finally {
      await context.close();
    }
  }

  async generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('ACCESSIBILITY AUDIT REPORT');
    console.log('='.repeat(60));

    const criticalIssues = this.issues.filter(i => i.priority === 'CRITICAL');
    const highIssues = this.issues.filter(i => i.priority === 'HIGH');
    const mediumIssues = this.issues.filter(i => i.priority === 'MEDIUM');

    console.log(`\nTotal Issues Found: ${this.issues.length}`);
    console.log(`Critical: ${criticalIssues.length}`);
    console.log(`High: ${highIssues.length}`);
    console.log(`Medium: ${mediumIssues.length}`);

    if (this.issues.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('DETAILED FINDINGS');
      console.log('='.repeat(60));

      this.issues.forEach((issue, idx) => {
        console.log(`\n[${idx + 1}] ${issue.check} - ${issue.page}`);
        console.log(`Priority: ${issue.priority}`);
        console.log(`Count: ${issue.count}`);
        console.log(`Details:`);
        issue.details.slice(0, 3).forEach(detail => {
          console.log(`  - ${JSON.stringify(detail).substring(0, 150)}`);
        });
      });
    }

    const reportPath = path.join(__dirname, 'WCAG_AUDIT_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      baseUrl: BASE_URL,
      pagesAudited: this.results,
      totalIssues: this.issues.length,
      issuesByPriority: {
        critical: criticalIssues.length,
        high: highIssues.length,
        medium: mediumIssues.length
      },
      detailedIssues: this.issues
    }, null, 2));

    console.log(`\n\nDetailed report saved to: ${reportPath}`);
  }

  async run() {
    const browser = await chromium.launch();

    try {
      for (const pageConfig of PAGES_TO_TEST) {
        await this.testPage(browser, pageConfig);
      }

      this.generateReport();
    } finally {
      await browser.close();
    }
  }
}

const auditor = new AccessibilityAuditor();
auditor.run().catch(console.error);
