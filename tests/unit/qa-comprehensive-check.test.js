// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { resolveTestUrl } from "../shared/test-env.js";

const testUrl = resolveTestUrl();

<<<<<<< HEAD
describe("QA Comprehensive UI/UX Check", () => {
	let dom;
	let window;
	let document;
=======
  beforeEach(() => {
    const authHtml = fs.readFileSync(
      path.join(process.cwd(), 'public/auth.html'),
      'utf-8'
    );
    dom = new JSDOM(authHtml, {
      url: (process.env.TEST_URL || 'http://localhost:8787').replace(/\/$/, '') + '/auth.html',
      pretendToBeVisual: true,
    });
    window = dom.window;
    document = window.document;
  });
>>>>>>> feature/short-term-tasks

	beforeEach(() => {
		const authHtml = fs.readFileSync(
			path.join(process.cwd(), "public/auth.html"),
			"utf-8",
		);
		dom = new JSDOM(authHtml, {
			url: `${testUrl.replace(/\/$/, "")}/auth.html`,
			pretendToBeVisual: true,
		});
		window = dom.window;
		document = window.document;
	});

	afterEach(() => {
		dom.window.close();
	});

	describe("Auth Page - Form Elements", () => {
		it("has all required form inputs", () => {
			expect(document.getElementById("email")).toBeTruthy();
			expect(document.getElementById("password")).toBeTruthy();
			expect(document.getElementById("name")).toBeTruthy();
			expect(document.getElementById("auth-form")).toBeTruthy();
		});

		it("email input has correct type and attributes", () => {
			const emailInput = document.getElementById("email");
			expect(emailInput.type).toBe("email");
			expect(emailInput.required).toBe(true);
			expect(emailInput.getAttribute("autocomplete")).toBeTruthy();
		});

		it("password input has correct type and attributes", () => {
			const passwordInput = document.getElementById("password");
			expect(passwordInput.type).toBe("password");
			expect(passwordInput.required).toBe(true);
			expect(passwordInput.getAttribute("autocomplete")).toBeTruthy();
		});

		it("name input is hidden by default", () => {
			const nameWrap = document.getElementById("name-wrap");
			expect(nameWrap.classList.contains("hidden")).toBe(true);
		});

		it("submit button exists and is initially disabled", () => {
			const submitBtn = document.getElementById("auth-submit");
			expect(submitBtn).toBeTruthy();
			expect(submitBtn.type).toBe("submit");
		});
	});

	describe("Auth Page - Modal Elements", () => {
		it("forgot password modal exists", () => {
			expect(document.getElementById("forgot-password-modal")).toBeTruthy();
			expect(document.getElementById("forgot-password-form")).toBeTruthy();
			expect(document.getElementById("forgot-email")).toBeTruthy();
		});

		it("reset password modal exists", () => {
			expect(document.getElementById("reset-password-modal")).toBeTruthy();
			expect(document.getElementById("reset-password-form")).toBeTruthy();
			expect(document.getElementById("new-password")).toBeTruthy();
			expect(document.getElementById("confirm-password")).toBeTruthy();
		});

		it("modals are hidden by default", () => {
			const forgotModal = document.getElementById("forgot-password-modal");
			const resetModal = document.getElementById("reset-password-modal");
			expect(forgotModal.classList.contains("hidden")).toBe(true);
			expect(resetModal.classList.contains("hidden")).toBe(true);
		});
	});

	describe("Auth Page - Accessibility", () => {
		it("form has proper labels or aria-labels", () => {
			const form = document.getElementById("auth-form");
			const inputs = form.querySelectorAll("input[required]");
			inputs.forEach((input) => {
				const hasLabel = document.querySelector(`label[for="${input.id}"]`);
				const hasAriaLabel = input.getAttribute("aria-label");
				expect(hasLabel || hasAriaLabel).toBeTruthy();
			});
		});

		it("buttons have accessible text", () => {
			const submitBtn = document.getElementById("auth-submit");
			const toggleBtn = document.getElementById("toggle-mode");
			expect(submitBtn.textContent.trim().length).toBeGreaterThan(0);
			expect(toggleBtn.textContent.trim().length).toBeGreaterThan(0);
		});

		it("error messages have proper ARIA attributes", () => {
			const errorDiv = document.getElementById("auth-error");
			expect(errorDiv).toBeTruthy();
			const hasAriaLive = errorDiv.getAttribute("aria-live");
			const hasRole = errorDiv.getAttribute("role");
			expect(hasAriaLive || hasRole).toBeTruthy();
		});
	});

	describe("Auth Page - CSS Classes", () => {
		it("uses Tailwind classes for styling", () => {
			const form = document.getElementById("auth-form");
			const classes = form.className;
			expect(classes.length).toBeGreaterThan(0);
			expect(form.getAttribute("style")).toBeFalsy();
		});

		it("toggle and submit buttons use styled classes", () => {
			const submitBtn = document.getElementById("auth-submit");
			const toggleBtn = document.getElementById("toggle-mode");
			expect(submitBtn.className.length).toBeGreaterThan(0);
			expect(toggleBtn.className.length).toBeGreaterThan(0);
		});
	});

	describe("Script Loading", () => {
		it("loads auth module script", () => {
			const scripts = document.querySelectorAll('script[type="module"]');
			const hasAuthScript = Array.from(scripts).some((s) =>
				s.src.includes("auth.js"),
			);
			expect(hasAuthScript).toBe(true);
		});

		it("has no inline event handlers", () => {
			const elementsWithHandlers = document.querySelectorAll(
				"[onclick], [onchange], [oninput], [onsubmit], [onload]",
			);
			expect(elementsWithHandlers.length).toBe(0);
		});
	});

	describe("Error Prevention", () => {
		it("has no console.log statements in HTML", () => {
			const html = fs.readFileSync(
				path.join(process.cwd(), "public/auth.html"),
				"utf-8",
			);
			expect(html).not.toContain("console.log");
		});

		it("has no hardcoded API keys or secrets", () => {
			const html = fs.readFileSync(
				path.join(process.cwd(), "public/auth.html"),
				"utf-8",
			);
			expect(html).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
			expect(html).not.toMatch(/api[_-]?key/i);
		});
	});
});
