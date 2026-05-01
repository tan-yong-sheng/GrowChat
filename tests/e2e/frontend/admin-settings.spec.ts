import { expect, test } from "@playwright/test";
import { renderAdminRoute, setupAdminPage } from "./admin-test-helpers";

test.describe.configure({ mode: "serial" });

test.describe("Admin settings immediate save flow", () => {
	test.beforeEach(async ({ page }) => {
		await setupAdminPage(page);
	});

	test("saves integrations modal changes immediately without a footer", async ({
		page,
	}) => {
		let saveCalls = 0;
		const savedBodies = [];

		await page.route("**/api/admin/tool-servers?include_disabled=1", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ servers: [] }),
			}),
		);

		await page.route("**/api/admin/tool-servers/test", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					message: "Connection successful",
					tools_verified_at: new Date().toISOString(),
					tools: [
						{
							name: "search",
							title: "Search",
							description: "Search documents",
							enabled: true,
						},
					],
				}),
			}),
		);

		await page.route("**/api/admin/tool-servers", async (route) => {
			if (route.request().method() !== "PUT") {
				return route.continue();
			}
			saveCalls += 1;
			const body = JSON.parse(route.request().postData() || "{}");
			savedBodies.push(body);
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ servers: body.servers || [] }),
			});
		});

		await renderAdminRoute(page, "/admin/settings/integrations");

		await expect(page.locator("#save-integrations")).toHaveCount(0);
		await expect(page.locator("#add-tool-server")).toBeVisible({
			timeout: 15000,
		});

		await page.locator("#add-tool-server").click();
		await expect(page.locator("#edit-connection-modal")).toBeVisible();
		await page.locator("#server-name").fill("Tavily");
		await page.locator("#server-url").fill("https://mcp.example.com");
		await page.locator("#save-modal").click();

		await expect.poll(() => saveCalls).toBe(1);
		expect(savedBodies).toHaveLength(1);
		expect(Array.isArray(savedBodies[0].servers)).toBe(true);
		expect(savedBodies[0].servers).toHaveLength(1);
		expect(savedBodies[0].servers[0].name).toBe("Tavily");
		expect(savedBodies[0].servers[0].url).toBe("https://mcp.example.com");
	});

	test("saves connection ACL changes immediately without a footer", async ({
		page,
	}) => {
		let accessPutCalls = 0;
		let saveCalls = 0;
		const savedBodies = [];

		await page.route(
			"**/api/admin/openai/connections?include_disabled=1",
			async (route) => {
				if (route.request().method() !== "GET") {
					return route.continue();
				}

				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						enabled: true,
						connections: [
							{
								id: "conn-1",
								name: "OpenAI",
								url: "https://api.openai.com/v1",
								key: "secret",
								providerType: "openai",
								providerFamily: "openai",
								apiType: "openai",
								enabled: true,
							},
						],
					}),
				});
			},
		);

		await page.route(
			"**/api/admin/openai/connections/conn-1/access**",
			async (route) => {
				if (route.request().method() === "GET") {
					return route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							user: { id: "1", name: "Admin", role: "admin" },
							groups: [
								{
									id: "g-1",
									name: "Team Alpha",
									description: "Primary ops team",
								},
							],
							rules: [],
						}),
					});
				}
				if (route.request().method() === "PUT") {
					accessPutCalls += 1;
					return route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({ ok: true }),
					});
				}
				return route.continue();
			},
		);

		await page.route("**/api/admin/openai/connections", async (route) => {
			if (route.request().method() !== "PUT") {
				return route.continue();
			}
			saveCalls += 1;
			const body = JSON.parse(route.request().postData() || "{}");
			savedBodies.push(body);
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					enabled: true,
					connections: body.connections || [],
				}),
			});
		});

		await renderAdminRoute(page, "/admin/settings/connections");

		await expect(page.locator("#save-connections")).toHaveCount(0);
		await expect(
			page.locator('.connection-acl-btn[data-id="conn-1"]'),
		).toBeVisible({ timeout: 15000 });

		await page.locator('.connection-acl-btn[data-id="conn-1"]').click();
		await expect(page.locator("#connection-acl-list")).toBeVisible();
		await page
			.locator(
				'#connection-acl-list .connection-acl-effect[data-group-id="g-1"]',
			)
			.selectOption("allow");
		await page.locator("#connection-acl-save-btn").click();

		await expect.poll(() => saveCalls).toBe(1);
		expect(accessPutCalls).toBe(0);
		expect(savedBodies).toHaveLength(1);
		expect(savedBodies[0].access_updates).toHaveLength(1);
		expect(savedBodies[0].access_updates[0].connection_id).toBe("conn-1");
		expect(savedBodies[0].access_updates[0].rules).toHaveLength(1);
		expect(savedBodies[0].access_updates[0].rules[0]).toMatchObject({
			principal_type: "group",
			principal_id: "g-1",
			effect: "allow",
			action: "use",
		});
	});

	test("shows selected models without a footer toggle", async ({ page }) => {
		let saveCalls = 0;

		await page.route("**/api/admin/models?**", async (route) => {
			if (route.request().method() !== "GET") {
				return route.continue();
			}

			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					models: [
						{
							id: "gpt-4",
							name: "GPT-4",
							provider: "openai",
							enabled: true,
						},
						{
							id: "gpt-5-mini",
							name: "GPT-5 Mini",
							provider: "openai",
							enabled: false,
						},
					],
					total: 2,
					active_total: 1,
					providers: [
						{ value: "all", label: "All Providers", active: 1, total: 2 },
						{ value: "openai", label: "OpenAI", active: 1, total: 2 },
					],
				}),
			});
		});

		await renderAdminRoute(page, "/admin/settings/models");

		await expect(page.locator("#save-models-top")).toHaveCount(0);
		await expect(page.locator('[data-model-row="gpt-4"]')).toBeVisible();
		await expect(page.locator('[data-model-row="gpt-5-mini"]')).toHaveCount(0);
		await expect(page.locator(".model-toggle")).toHaveCount(0);
		await expect(page.getByText("Selected models")).toBeVisible();
		await expect(page.locator('[title="Selected models"]')).toHaveText("1");
		await expect.poll(() => saveCalls).toBe(0);
	});

	test("saves general settings immediately without an unsaved prompt", async ({
		page,
	}) => {
		let configCalls = 0;

		await page.route("**/api/admin/config", async (route) => {
			if (route.request().method() === "GET") {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						public_registration: true,
						public_registration_status: "pending",
						default_model_id: "gpt-4",
					}),
				});
			}

			if (route.request().method() === "PUT") {
				configCalls += 1;
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						public_registration: true,
						public_registration_status: "active",
						default_model_id: "gpt-4",
					}),
				});
			}

			return route.continue();
		});

		await renderAdminRoute(page, "/admin/settings/general");

		await expect(page.locator("#save-settings")).toHaveCount(0);
		await expect(page.locator("#registration-status")).toBeVisible({
			timeout: 15000,
		});

		await page.locator("#registration-status").selectOption("active");
		await expect.poll(() => configCalls).toBe(1);

		await page.goto("/admin/settings/connections");
		await expect(page).toHaveURL(/\/admin\/settings\/connections$/);
	});

	test("does not block beforeunload after immediate save", async ({ page }) => {
		await page.route("**/api/admin/config", async (route) => {
			if (route.request().method() === "GET") {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						public_registration: true,
						public_registration_status: "pending",
						default_model_id: "gpt-4",
					}),
				});
			}

			if (route.request().method() === "PUT") {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						public_registration: true,
						public_registration_status: "active",
						default_model_id: "gpt-4",
					}),
				});
			}

			return route.continue();
		});

		await renderAdminRoute(page, "/admin/settings/general");
		await page.locator("#registration-status").selectOption("active");
		await page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
		await expect(page.locator("#registration-status")).toHaveValue("active");
	});
});
