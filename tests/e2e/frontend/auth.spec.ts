import { test, expect } from "@playwright/test";

const env = (globalThis as any).process?.env ?? {};
const testEmail = env.TEST_EMAIL;
const testPassword = env.TEST_PASSWORD;

test.describe("Auth Page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/auth.html");
		await page.waitForSelector("#auth-title", {
			state: "visible",
			timeout: 10000,
		});
	});

	test("login mode renders expected controls and labels", async ({ page }) => {
		await expect(page.locator("#auth-title")).toHaveText("Sign in to GrowChat");
		await expect(page.locator("#auth-submit")).toHaveText("Sign in");
		await expect(page.locator("#email")).toBeVisible();
		await expect(page.locator("#password")).toBeVisible();
		await expect(page.locator("#name-wrap")).toHaveClass(/hidden/);
	});

	test("toggle to register mode shows name field and label changes", async ({
		page,
	}) => {
		await page.click("#toggle-mode");
		await expect(page.locator("#auth-title")).toHaveText("Create an account");
		await expect(page.locator("#auth-submit")).toHaveText("Sign up");
		await expect(page.locator("#name")).toBeVisible();
		await expect(page.locator("#name-wrap")).toBeVisible();
	});

	test("failed login shows inline error message", async ({ page }) => {
		await page.route("/api/auth/login", async (route) => {
			await route.fulfill({
				status: 401,
				contentType: "application/json",
				body: JSON.stringify({ error: "Invalid credentials" }),
			});
		});

		await page.fill("#email", "test@example.com");
		await page.fill("#password", "wrongpassword");
		await page.click("#auth-submit");

		const errorMsg = page.locator("#auth-error");
		await expect(errorMsg).toBeVisible();
		await expect(errorMsg).toHaveText("Invalid credentials");
	});

	test("successful login stores auth state and redirects to /", async ({
		page,
	}) => {
		test.skip(
			!testEmail || !testPassword,
			"TEST_EMAIL and TEST_PASSWORD must be set for auth e2e",
		);

		await page.fill("#email", testEmail);
		await page.fill("#password", testPassword);
		await page.click("#auth-submit");

		await page.waitForURL("/");
		await expect(page.locator(".user-profile-btn")).toBeVisible({
			timeout: 5000,
		});
	});

	test("failed register shows API error", async ({ page }) => {
		await page.click("#toggle-mode");
		await page.route("/api/auth/register", async (route) => {
			await route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({ error: "Email already exists" }),
			});
		});

		await page.fill("#name", "Test User");
		await page.fill("#email", "existing@example.com");
		await page.fill("#password", "password123");
		await page.click("#auth-submit");

		const errorMsg = page.locator("#auth-error");
		await expect(errorMsg).toBeVisible();
		await expect(errorMsg).toHaveText("Email already exists");
	});

	test("successful register redirects to /", async ({ page }) => {
		await page.click("#toggle-mode");
		const mockAuthResponse = {
			access_token: "new-token",
			refresh_token: "new-refresh",
			user: { id: "2", name: "New User", email: "new@example.com" },
		};

		await page.route("/api/auth/register", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(mockAuthResponse),
			});
		});

		await page.route("/", async (route) => {
			await route.fulfill({
				status: 200,
				body: "<html><body>Main App</body></html>",
			});
		});

		await page.fill("#name", "New User");
		await page.fill("#email", "new@example.com");
		await page.fill("#password", "password123");
		await page.click("#auth-submit");

		await page.waitForURL("**/");
		const authState = await page.evaluate(() =>
			JSON.parse(localStorage.getItem("growchat_auth") ?? "null"),
		);
		expect(authState).toEqual(mockAuthResponse);
	});
});
