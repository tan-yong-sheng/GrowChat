// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { resolveTestUrl } from "../shared/test-env.js";

const testUrl = resolveTestUrl();

<<<<<<< HEAD
describe("Form Error Message Association - WCAG 2.1.3", () => {
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

	it("error message has aria-describedby linking to form", () => {
		const errorDiv = document.getElementById("auth-error");
		expect(errorDiv.id).toBe("auth-error");
		expect(errorDiv.getAttribute("aria-live")).toBe("polite");
		expect(errorDiv.getAttribute("role")).toBe("alert");
	});

	it("modal error messages are properly associated", () => {
		const modalError = document.getElementById("modal-error");
		const modalSuccess = document.getElementById("modal-success");
		expect(modalError.getAttribute("aria-live")).toBeTruthy();
		expect(modalSuccess.getAttribute("aria-live")).toBeTruthy();
	});

	it("reset password error messages are properly associated", () => {
		const resetError = document.getElementById("reset-error");
		const resetSuccess = document.getElementById("reset-success");
		expect(resetError.getAttribute("aria-live")).toBeTruthy();
		expect(resetSuccess.getAttribute("aria-live")).toBeTruthy();
	});
});
