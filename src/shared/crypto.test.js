import { describe, it, expect, vi } from "vitest";
import { generateToken, hashTokenAsync, constantTimeEquals } from "./crypto.js";

describe("Crypto utilities", () => {
	describe("generateToken", () => {
		it("generates 64-char hex string by default", () => {
			const token = generateToken();
			expect(token).toMatch(/^[a-f0-9]{64}$/);
		});

		it("generates correct length for custom byte count", () => {
			const token = generateToken(16);
			expect(token).toMatch(/^[a-f0-9]{32}$/); // 16 bytes = 32 hex chars
		});
	});

	describe("hashTokenAsync", () => {
		it("returns stable SHA-256 hash for same input", async () => {
			const token = "test-token-12345";
			const hash1 = await hashTokenAsync(token);
			const hash2 = await hashTokenAsync(token);
			expect(hash1).toBe(hash2);
		});

		it("returns 64-char hex string", async () => {
			const hash = await hashTokenAsync("test");
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});

		it("different inputs produce different hashes", async () => {
			const hash1 = await hashTokenAsync("token1");
			const hash2 = await hashTokenAsync("token2");
			expect(hash1).not.toBe(hash2);
		});
	});

	describe("constantTimeEquals", () => {
		it("returns true for identical strings", () => {
			expect(constantTimeEquals("abc", "abc")).toBe(true);
		});

		it("returns false for different strings", () => {
			expect(constantTimeEquals("abc", "def")).toBe(false);
		});

		it("returns false for different lengths", () => {
			expect(constantTimeEquals("abc", "abcd")).toBe(false);
		});

		it("returns false for non-string inputs", () => {
			expect(constantTimeEquals(123, "123")).toBe(false);
			expect(constantTimeEquals(null, "null")).toBe(false);
		});
	});

	describe("hashToken sync path", () => {
		it("should not export fake sync hashToken", async () => {
			// Import the module to check exports
			const crypto = await import("./crypto.js");

			// If hashToken exists and returns fake 'hashed-' prefix, fail
			if (crypto.hashToken) {
				const result = crypto.hashToken("test");
				expect(result).not.toMatch(/^hashed-/);
			}
		});
	});
});
