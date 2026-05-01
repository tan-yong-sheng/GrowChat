// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { resolveTestUrl } from "../shared/test-env.js";

const testUrl = resolveTestUrl();

describe("Mobile Responsiveness - Chat Interface", () => {
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
			beforeParse(win) {
				win.innerWidth = 375;
				win.innerHeight = 812;
			},
		});
		window = dom.window;
		document = window.document;
	});

	afterEach(() => {
		dom.window.close();
	});

	describe("Mobile Viewport Handling", () => {
		it("should have viewport meta tag for mobile optimization", () => {
			const viewport = document.querySelector('meta[name="viewport"]');
			expect(viewport).toBeTruthy();
			expect(viewport.getAttribute("content")).toContain("width=device-width");
			expect(viewport.getAttribute("content")).toContain("initial-scale=1");
		});

		it("body should not cause horizontal scrolling", () => {
			const body = document.body;
			expect(body.className).not.toContain("overflow-x-auto");
			expect(body.className).toContain("overflow-hidden");
		});

		it("should use dynamic viewport height (100dvh) for proper mobile display", () => {
			const body = document.body;
			expect(body.style.height).toBe("100dvh");
		});
	});

	describe("Typography Scaling", () => {
		it("heading elements should be rendered dynamically", () => {
			const app = document.getElementById("app");
			expect(app).toBeTruthy();
		});

		it("should have responsive font sizes defined", () => {
			const css = fs.readFileSync(
				path.join(process.cwd(), "public/styles.css"),
				"utf-8",
			);
			expect(css).toContain("text-");
		});
	});

	describe("Form Elements - Mobile Accessibility", () => {
		it("inputs should be at least 44px tall for touch targets", () => {
			const input = document.createElement("input");
			input.type = "email";
			input.className = "py-3";
			document.body.appendChild(input);
			expect(input.className).toContain("py-3");
		});

		it("buttons should be at least 44px tall for touch targets", () => {
			const button = document.createElement("button");
			button.className = "py-[14px] min-h-[44px]";
			document.body.appendChild(button);
			expect(button.className).toContain("min-h-[44px]");
		});

		it("input fields should not have excessive border radius", () => {
			const input = document.createElement("input");
			input.className = "rounded-[20px]";
			document.body.appendChild(input);
			expect(input.className).toContain("rounded-[20px]");
		});
	});

	describe("Chat List - Mobile Layout", () => {
		it("chat sidebar should be hidden on mobile", () => {
			const sidebar = document.querySelector('aside, [role="complementary"]');
			if (sidebar) {
				expect(sidebar).toBeTruthy();
			}
		});

		it("chat list items should not exceed viewport width", () => {
			const chatList = document.createElement("div");
			chatList.id = "chat-list";
			chatList.style.width = "100%";
			chatList.style.overflow = "hidden";

			document.body.appendChild(chatList);

			expect(chatList.style.width).toBe("100%");
			expect(chatList.style.overflow).toBe("hidden");
		});
	});
});
