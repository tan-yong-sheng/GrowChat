// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { resolveTestUrl } from "../shared/test-env.js";

const testUrl = resolveTestUrl();

describe("Focus Ring Contrast - WCAG AA Compliance", () => {
	let dom;
	let window;
	let document;

	beforeEach(() => {
		const authHtml = fs.readFileSync(
			path.join(process.cwd(), "public/auth.html"),
			"utf-8",
		);
		const css = fs.readFileSync(
			path.join(process.cwd(), "public/styles.css"),
			"utf-8",
		);

		dom = new JSDOM(authHtml, {
			url: `${testUrl.replace(/\/$/, "")}/auth.html`,
			pretendToBeVisual: true,
		});
		window = dom.window;
		document = window.document;

		const styleEl = document.createElement("style");
		styleEl.textContent = css;
		document.head.appendChild(styleEl);
	});

	afterEach(() => {
		dom.window.close();
	});

	it("focus ring uses gray-500 for proper contrast", () => {
		const inputs = document.querySelectorAll(
			'input[type="email"], input[type="password"]',
		);
		inputs.forEach((input) => {
			expect(input.className).toContain("focus:ring-gray-500");
		});
	});

	it("input fields have visible focus indicators", () => {
		const inputs = document.querySelectorAll(
			'input[type="email"], input[type="password"]',
		);
		inputs.forEach((input) => {
			expect(input.className).toContain("focus:");
			expect(input.className).toMatch(/focus:(ring|outline|border)/);
		});
	});

	it("form buttons have visible focus ring styles", () => {
		const buttons = document.querySelectorAll("button");
		buttons.forEach((btn) => {
			expect(btn.className).toContain("focus:");
			expect(btn.className).toContain("focus:outline-none");
			expect(btn.className).toContain("focus:ring-2");
			expect(btn.className).toContain("focus:ring-offset-2");
		});
	});
});
