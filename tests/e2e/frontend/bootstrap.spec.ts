import { expect, test } from "@playwright/test";

test("auth page opens in register mode for fresh workspace", async ({
	page,
	context,
}) => {
	await context.addInitScript(() => {
		const originalFetch = window.fetch.bind(window);
		window.fetch = async (input, init) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof Request
						? input.url
						: input.toString();
			if (url.endsWith("/api/health")) {
				return new Response(JSON.stringify({ initialized: false }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			return originalFetch(input, init);
		};
	});

	await page.goto("/auth.html");

	await expect(page.locator("#auth-title")).toHaveText("Create an account");
	await expect(page.locator("#name-wrap")).not.toHaveClass(/hidden/);
	await expect(page.locator("#auth-submit")).toHaveText("Sign up");
});
