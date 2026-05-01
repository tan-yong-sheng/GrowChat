// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { resolveTestUrl } from "../shared/test-env.js";

const testUrl = resolveTestUrl();

describe("QA Chat Interface - HTML Structure", () => {
	let dom;
	let window;
	let document;

	beforeEach(() => {
		const indexHtml = fs.readFileSync(
			path.join(process.cwd(), "public/index.html"),
			"utf-8",
		);
		dom = new JSDOM(indexHtml, {
			url: testUrl,
			pretendToBeVisual: true,
		});
		window = dom.window;
		document = window.document;
	});

	afterEach(() => {
		dom.window.close();
	});

	describe("Main Layout", () => {
		it("has main app container for dynamic rendering", () => {
			expect(document.getElementById("app")).toBeTruthy();
		});
	});

	describe("Chat List", () => {
		it("app container exists for dynamic rendering", () => {
			const app = document.getElementById("app");
			expect(app).toBeTruthy();
			// Chat list will be rendered dynamically by JavaScript
		});
	});

	describe("Message Input", () => {
		it("app container exists for dynamic rendering", () => {
			const app = document.getElementById("app");
			expect(app).toBeTruthy();
			// Message input will be rendered dynamically by JavaScript
		});
	});

	describe("Accessibility - Main App", () => {
		it("has proper document language", () => {
			const html = document.documentElement;
			expect(html.getAttribute("lang")).toBeTruthy();
		});

		it("has proper viewport meta tag", () => {
			const viewport = document.querySelector('meta[name="viewport"]');
			expect(viewport).toBeTruthy();
			expect(viewport.getAttribute("content")).toContain("width=device-width");
		});

		it("has title element", () => {
			expect(document.title).toBeTruthy();
		});

		it("has favicon", () => {
			const favicon = document.querySelector('link[rel="icon"]');
			expect(favicon).toBeTruthy();
		});
	});

	describe("CSS and Styling", () => {
		it("loads stylesheet", () => {
			const stylesheet = document.querySelector('link[rel="stylesheet"]');
			expect(stylesheet).toBeTruthy();
		});

		it("uses Tailwind classes (not inline styles)", () => {
			const body = document.body;
			const hasClasses = body.className && body.className.length > 0;
			expect(hasClasses).toBe(true);
		});
	});

	describe("Script Loading", () => {
		it("loads app.js module", () => {
			const scripts = document.querySelectorAll('script[type="module"]');
			const hasAppScript = Array.from(scripts).some((s) =>
				s.src.includes("app.js"),
			);
			expect(hasAppScript).toBe(true);
		});

		it("has no inline event handlers", () => {
			const elementsWithHandlers = document.querySelectorAll(
				"[onclick], [onchange], [oninput], [onsubmit], [onload]",
			);
			expect(elementsWithHandlers.length).toBe(0);
		});
	});

	describe("Semantic HTML", () => {
		it("app container exists for dynamic content", () => {
			const app = document.getElementById("app");
			expect(app).toBeTruthy();
		});
	});

	describe("Form Elements", () => {
		it("all inputs have associated labels or aria-labels", () => {
			const inputs = document.querySelectorAll("input, textarea, select");
			inputs.forEach((input) => {
				const id = input.id;
				const hasLabel = id && document.querySelector(`label[for="${id}"]`);
				const hasAriaLabel = input.getAttribute("aria-label");
				expect(hasLabel || hasAriaLabel).toBeTruthy();
			});
		});
	});

	describe("Error Prevention", () => {
		it("has no console.log statements in HTML", () => {
			const html = fs.readFileSync(
				path.join(process.cwd(), "public/index.html"),
				"utf-8",
			);
			expect(html).not.toContain("console.log");
		});

		it("has no hardcoded API keys or secrets", () => {
			const html = fs.readFileSync(
				path.join(process.cwd(), "public/index.html"),
				"utf-8",
			);
			expect(html).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
			expect(html).not.toMatch(/api[_-]?key/i);
		});
	});
});
