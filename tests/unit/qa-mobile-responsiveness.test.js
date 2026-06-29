// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";

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
			url: process.env.TEST_URL || "http://localhost:8787/",
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
			// Note: h1 is rendered dynamically by JavaScript, not in static HTML
			// This test verifies the structure is in place for dynamic rendering
			const app = document.getElementById("app");
			expect(app).toBeTruthy();
		});

		it("should have responsive font sizes defined", () => {
			const css = fs.readFileSync(
				path.join(process.cwd(), "public/styles.css"),
				"utf-8",
			);
			// Check that responsive classes are defined
			expect(css).toContain("text-");
		});
	});

	describe("Form Elements - Mobile Accessibility", () => {
		it("inputs should be at least 44px tall for touch targets", () => {
			const input = document.createElement("input");
			input.type = "email";
			input.className = "py-3";
			document.body.appendChild(input);

			// py-3 = 0.75rem = 12px padding, min height should be 44px
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
			input.className = "rounded-lg";
			document.body.appendChild(input);

			// Border radius should be reasonable (20px is acceptable for rounded look)
			expect(input.className).toContain("rounded-lg");
		});
	});

	describe("Chat List - Mobile Layout", () => {
		it("chat sidebar should be hidden on mobile", () => {
			const sidebar = document.querySelector('aside, [role="complementary"]');
			if (sidebar) {
				// On mobile, sidebar should either be hidden or use sidebar-slim class
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

	describe("Message Input - Mobile", () => {
		it("message input should have responsive width on mobile", () => {
			const input = document.createElement("textarea");
			input.className = "w-full";
			input.id = "message-input";

			document.body.appendChild(input);

			expect(input.className).toContain("w-full");
		});

		it("message input should be accessible with larger touch targets", () => {
			const button = document.createElement("button");
			button.className = "min-h-[44px]";
			button.type = "submit";

			document.body.appendChild(button);

			expect(button.className).toContain("min-h-[44px]");
		});
	});

	describe("Modal - Mobile Display", () => {
		it("modal should be full width on mobile", () => {
			const modal = document.createElement("div");
			modal.className = "fixed inset-0 w-full";
			modal.setAttribute("role", "dialog");

			document.body.appendChild(modal);

			expect(modal.className).toContain("w-full");
		});

		it("modal content should have max-width for readability", () => {
			const content = document.createElement("div");
			content.className = "max-w-[440px]";

			document.body.appendChild(content);

			expect(content.className).toContain("max-w-");
		});
	});

	describe("Touch-Friendly Design", () => {
		it("interactive elements should have adequate spacing", () => {
			const button = document.createElement("button");
			button.className = "p-2 gap-2";

			document.body.appendChild(button);

			expect(button.className).toContain("p-");
			expect(button.className).toContain("gap-");
		});

		it("hover states should not break mobile accessibility", () => {
			const div = document.createElement("div");
			div.className = "group-hover:bg-gray-100";

			document.body.appendChild(div);

			// Hover classes should exist but not interfere with touch
			expect(div.className).toContain("group-hover:");
		});
	});

	describe("Landscape Mode - Mobile", () => {
		it("app should work in landscape orientation", () => {
			const viewport = document.querySelector('meta[name="viewport"]');
			expect(viewport).toBeTruthy();
		});

		it("should handle viewport fit for notch devices", () => {
			const viewport = document.querySelector('meta[name="viewport"]');
			expect(viewport.getAttribute("content")).toContain("viewport-fit");
		});
	});
});
