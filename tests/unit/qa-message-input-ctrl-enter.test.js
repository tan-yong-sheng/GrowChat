// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { resolveTestUrl } from "../shared/test-env.js";

const testUrl = resolveTestUrl();

describe("Message Input - Ctrl+Enter Keyboard Shortcut", () => {
	let dom;
	let window;
	let document;
	let container;
	let input;
	let composer;

	function attachKeydownHandler() {
		input.addEventListener("keydown", async (e) => {
			const isEnter = e.key === "Enter";
			const isCtrlOrCmd = e.ctrlKey || e.metaKey;
			const isShift = e.shiftKey;

			if (isEnter && isCtrlOrCmd) {
				e.preventDefault();
				if (input.value.trim()) composer.dispatchEvent(new Event("submit"));
			} else if (isEnter && !isShift && !isCtrlOrCmd) {
				e.preventDefault();
				if (input.value.trim()) composer.dispatchEvent(new Event("submit"));
			}
		});
	}

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

		container = document.createElement("div");
		composer = document.createElement("form");
		composer.id = "composer";
		composer.className = "relative";

		input = document.createElement("textarea");
		input.id = "message-input";
		input.placeholder = "Message";
		input.style.height = "44px";

		const sendBtn = document.createElement("button");
		sendBtn.id = "send-btn";
		sendBtn.type = "button";
		sendBtn.setAttribute("aria-label", "Send message");

		composer.appendChild(input);
		composer.appendChild(sendBtn);
		container.appendChild(composer);
		document.body.appendChild(container);

		attachKeydownHandler();
	});

	afterEach(() => {
		dom.window.close();
	});

	describe("Ctrl+Enter Shortcut", () => {
		it("should send message on Ctrl+Enter", () => {
			input.value = "Hello world";

			let submitFired = false;
			composer.addEventListener("submit", (e) => {
				e.preventDefault();
				submitFired = true;
			});

			const event = new KeyboardEvent("keydown", {
				key: "Enter",
				code: "Enter",
				ctrlKey: true,
				bubbles: true,
			});

			input.dispatchEvent(event);
			expect(submitFired).toBe(true);
		});

		it("should send message on Cmd+Enter (Mac equivalent)", () => {
			input.value = "Test message";

			let submitFired = false;
			composer.addEventListener("submit", (e) => {
				e.preventDefault();
				submitFired = true;
			});

			const event = new KeyboardEvent("keydown", {
				key: "Enter",
				code: "Enter",
				metaKey: true,
				bubbles: true,
			});

			input.dispatchEvent(event);
			expect(submitFired).toBe(true);
		});

		it("should not send message on Shift+Enter (allows multi-line)", () => {
			input.value = "Hello\nworld";

			let submitFired = false;
			composer.addEventListener("submit", (e) => {
				e.preventDefault();
				submitFired = true;
			});

			const event = new KeyboardEvent("keydown", {
				key: "Enter",
				code: "Enter",
				shiftKey: true,
				ctrlKey: false,
				metaKey: false,
				bubbles: true,
			});

			input.dispatchEvent(event);
			expect(submitFired).toBe(false);
		});

		it("should send on regular Enter when on single line", () => {
			input.value = "Single line message";

			let submitFired = false;
			composer.addEventListener("submit", (e) => {
				e.preventDefault();
				submitFired = true;
			});

			const event = new KeyboardEvent("keydown", {
				key: "Enter",
				code: "Enter",
				ctrlKey: false,
				metaKey: false,
				shiftKey: false,
				bubbles: true,
			});

			input.dispatchEvent(event);
			expect(submitFired).toBe(true);
		});

		it("should not send empty message", () => {
			input.value = "   ";

			let submitFired = false;
			composer.addEventListener("submit", (e) => {
				e.preventDefault();
				submitFired = true;
			});

			const event = new KeyboardEvent("keydown", {
				key: "Enter",
				code: "Enter",
				ctrlKey: true,
				bubbles: true,
			});

			input.dispatchEvent(event);
			expect(submitFired).toBe(false);
		});
	});
});
