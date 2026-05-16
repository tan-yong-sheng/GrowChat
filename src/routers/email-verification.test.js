// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock dependencies BEFORE importing module
vi.mock("../db.js", () => ({
	createDB: vi.fn(),
}));

vi.mock("../shared/crypto.js", () => ({
	generateToken: vi.fn(() => "test-token-123"),
	hashTokenAsync: vi.fn(async (token) => `hashed-${token}`),
}));

vi.mock("../services/email/email-service.js", () => ({
	createEmailService: vi.fn(() => ({
		send: vi.fn().mockResolvedValue({ id: "email-123" }),
	})),
}));

vi.mock("fs", () => ({
	readFileSync: vi.fn(() => "<html>{{userName}} {{verificationUrl}}</html>"),
}));

vi.mock("url", () => ({
	fileURLToPath: vi.fn(() => "/mock/path/file.js"),
}));

vi.mock("path", () => ({
	dirname: vi.fn(() => "/mock/path"),
	join: vi.fn(() => "/mock/path/template.html"),
}));

// NOW import the module
import { verifyEmail, resendVerification } from "./email-verification.js";
import { createDB } from "../db.js";

describe("Email Verification", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("verifyEmail", () => {
		it("returns error when token is missing", async () => {
			createDB.mockReturnValue({
				prepare: vi.fn(() => ({
					bind: vi.fn(() => ({
						first: vi.fn().mockResolvedValue(null),
					})),
				})),
			});

			const result = await verifyEmail({ env: { DB: {} } });
			expect(result.status).toBe(400);
			const body = await result.json();
			expect(body.error.toLowerCase()).toContain("token");
		});

		it("returns error when token not found", async () => {
			createDB.mockReturnValue({
				prepare: vi.fn(() => ({
					bind: vi.fn(() => ({
						first: vi.fn().mockResolvedValue(null),
					})),
				})),
			});

			const result = await verifyEmail({
				token: "invalid-token",
				env: { DB: {} },
			});
			expect(result.status).toBe(400);
			const body = await result.json();
			expect(body.error.toLowerCase()).toContain("invalid");
		});

		it("returns error when token expired", async () => {
			const expiredTime = Math.floor(Date.now() / 1000) - 3600;
			createDB.mockReturnValue({
				prepare: vi.fn(() => ({
					bind: vi.fn(() => ({
						first: vi.fn().mockResolvedValue({
							id: "verification-1",
							user_id: "user-1",
							token_hash: "hashed-token",
							expires_at: expiredTime,
						}),
					})),
				})),
			});

			const result = await verifyEmail({
				token: "expired-token",
				env: { DB: {} },
			});
			expect(result.status).toBe(400);
			const body = await result.json();
			expect(body.error.toLowerCase()).toContain("expired");
		});

		it("verifies email successfully", async () => {
			const futureTime = Math.floor(Date.now() / 1000) + 3600;
			createDB.mockReturnValue({
				prepare: vi.fn((sql) => {
					if (sql.includes("SELECT")) {
						return {
							bind: vi.fn(() => ({
								first: vi.fn().mockResolvedValue({
									id: "verification-1",
									user_id: "user-1",
									token_hash: "hashed-token",
									expires_at: futureTime,
								}),
							})),
						};
					}
					return {
						bind: vi.fn(() => ({
							run: vi.fn().mockResolvedValue({ success: true }),
						})),
					};
				}),
				batch: vi.fn().mockResolvedValue([{ results: [] }, { results: [] }]),
			});

			const result = await verifyEmail({
				token: "valid-token",
				env: { DB: {} },
			});
			expect(result.status).toBe(200);
			const body = await result.json();
			expect(body.message).toContain("verified");
		});
	});

	describe("resendVerification", () => {
		it("returns success for non-existent user (prevents enumeration)", async () => {
			createDB.mockReturnValue({
				prepare: vi.fn(() => ({
					bind: vi.fn(() => ({
						first: vi.fn().mockResolvedValue(null),
					})),
				})),
			});

			const result = await resendVerification({
				email: "nonexistent@example.com",
				env: { DB: {} },
			});
			expect(result.status).toBe(200);
			const body = await result.json();
			expect(body.message).toContain("sent");
		});

		it("sends verification email for unverified user", async () => {
			createDB.mockReturnValue({
				prepare: vi.fn((sql) => {
					if (sql.includes("SELECT")) {
						return {
							bind: vi.fn(() => ({
								first: vi.fn().mockResolvedValue({
									id: "user-1",
									email: "test@example.com",
									name: "Test User",
									account_status: "pending",
								}),
							})),
						};
					}
					return {
						bind: vi.fn(() => ({
							run: vi.fn().mockResolvedValue({ success: true }),
						})),
					};
				}),
			});

			const result = await resendVerification({
				email: "test@example.com",
				env: {
					DB: {},
					APP_URL: "http://localhost:8787",
					RESEND_API_KEY: "test-key",
				},
			});
			expect(result.status).toBe(200);
			const body = await result.json();
			expect(body.message).toContain("sent");
		});

		it("returns success for already verified user (prevents enumeration)", async () => {
			createDB.mockReturnValue({
				prepare: vi.fn(() => ({
					bind: vi.fn(() => ({
						first: vi.fn().mockResolvedValue({
							id: "user-1",
							email: "verified@example.com",
							name: "Verified User",
							account_status: "active",
						}),
					})),
				})),
			});

			const result = await resendVerification({
				email: "verified@example.com",
				env: { DB: {}, APP_URL: "http://localhost:8787" },
			});
			expect(result.status).toBe(200);
			const body = await result.json();
			expect(body.message).toContain("sent");
		});
	});
});
