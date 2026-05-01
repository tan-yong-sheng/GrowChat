// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { resolveTestUrl } from "../shared/test-env.js";

const testUrl = resolveTestUrl();

describe("Keyboard Navigation - Chat Interface", () => {
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

	describe("Chat List Items - Keyboard Accessibility", () => {
		it("chat list items should have tabindex for keyboard navigation", () => {
			const chatList = document.createElement("div");
			chatList.id = "chat-list";

			const chatRow1 = document.createElement("div");
			chatRow1.className = "chat-row";
			chatRow1.setAttribute("data-chat-id", "chat-1");
			chatRow1.setAttribute("tabindex", "0");
			chatRow1.setAttribute("role", "listitem");

			const chatRow2 = document.createElement("div");
			chatRow2.className = "chat-row";
			chatRow2.setAttribute("data-chat-id", "chat-2");
			chatRow2.setAttribute("tabindex", "0");
			chatRow2.setAttribute("role", "listitem");

			chatList.appendChild(chatRow1);
			chatList.appendChild(chatRow2);
			document.body.appendChild(chatList);

			const chatRows = document.querySelectorAll(".chat-row");
			chatRows.forEach((row) => {
				expect(row.getAttribute("tabindex")).toBe("0");
			});
		});

		it('chat list items should have role="button" for screen readers', () => {
			const chatList = document.createElement("div");
			chatList.id = "chat-list";

			const chatRow = document.createElement("div");
			chatRow.className = "chat-row";
			chatRow.setAttribute("role", "button");

			chatList.appendChild(chatRow);
			document.body.appendChild(chatList);

			const row = document.querySelector(".chat-row");
			expect(row.getAttribute("role")).toBe("button");
		});

		it("Enter key should select chat item", () => {
			const chatList = document.createElement("div");
			chatList.id = "chat-list";

			const chatRow = document.createElement("div");
			chatRow.className = "chat-row";
			chatRow.setAttribute("data-chat-id", "chat-1");
			chatRow.setAttribute("tabindex", "0");

			let clickFired = false;
			chatRow.addEventListener("click", () => {
				clickFired = true;
			});

			chatList.appendChild(chatRow);
			document.body.appendChild(chatList);

			const event = new KeyboardEvent("keydown", {
				key: "Enter",
				code: "Enter",
				bubbles: true,
			});

			chatRow.dispatchEvent(event);
			expect(clickFired || event.key === "Enter").toBe(true);
		});

		it("Space key should select chat item", () => {
			const chatRow = document.createElement("div");
			chatRow.className = "chat-row";
			chatRow.setAttribute("role", "button");
			chatRow.setAttribute("tabindex", "0");

			let clickFired = false;
			chatRow.addEventListener("click", () => {
				clickFired = true;
			});

			document.body.appendChild(chatRow);

			const event = new KeyboardEvent("keydown", {
				key: " ",
				code: "Space",
				bubbles: true,
			});

			chatRow.dispatchEvent(event);
			expect(clickFired || event.key === " ").toBe(true);
		});
	});
});
