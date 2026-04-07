import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Focus Ring Contrast - WCAG AA Compliance', () => {
  let dom;
  let window;
  let document;
  let styles;

  beforeEach(() => {
    const authHtml = fs.readFileSync(
      path.join(process.cwd(), 'public/auth.html'),
      'utf-8'
    );
    const css = fs.readFileSync(
      path.join(process.cwd(), 'public/styles.css'),
      'utf-8'
    );
    styles = css;

    dom = new JSDOM(authHtml, {
      url: 'http://localhost:8787/auth.html',
      pretendToBeVisual: true,
    });
    window = dom.window;
    document = window.document;

    // Inject Tailwind to test focus ring
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    dom.window.close();
  });

  it('focus ring uses gray-500 for proper contrast', () => {
    // Check that input fields use focus:ring-gray-500 for WCAG AA compliance
    // White background needs gray-500 or darker for 3:1 minimum contrast
    const inputs = document.querySelectorAll('input[type="email"], input[type="password"]');
    inputs.forEach((input) => {
      expect(input.className).toContain('focus:ring-gray-500');
    });
  });

  it('input fields have visible focus indicators', () => {
    const inputs = document.querySelectorAll('input[type="email"], input[type="password"]');

    inputs.forEach((input) => {
      // Each input should have focus classes for visible feedback
      expect(input.className).toContain('focus:');
      expect(input.className).toMatch(/focus:(ring|outline|border)/);
    });
  });

  it('form buttons have focus styles with gray-500 ring', () => {
    const buttons = document.querySelectorAll('button');

    buttons.forEach((btn) => {
      // All buttons should have focus ring classes for keyboard navigation
      expect(btn.className).toContain('focus:');
      expect(btn.className).toContain('focus:ring-gray-500');
    });
  });
});
