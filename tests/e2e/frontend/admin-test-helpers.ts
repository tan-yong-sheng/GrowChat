import type { Page } from "@playwright/test";
import { TEST_JWT } from "../../shared/test-env";

export { TEST_JWT };

export async function mockAdminBootstrap(page: Page) {
	await page.route(/\/api\/users\/me(?:[/?].*)?$/, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				user: { id: "1", name: "Admin", role: "admin", primary_role: "admin" },
				permissions: [
					"admin.rbac.admin",
					"model.admin",
					"model.use",
					"chat.read",
					"chat.write",
				],
				roles: [{ role_name: "admin" }],
				app_config: { default_model_id: "gpt-4" },
			}),
		}),
	);

	await page.route(/\/api\/auth\/refresh(?:[/?].*)?$/, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				access_token: TEST_JWT,
				refresh_token: "refresh-token",
				user: { id: "1", name: "Admin", role: "admin" },
			}),
		}),
	);

	await page.route(/\/api\/chats(?:[/?].*)?$/, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ chats: [] }),
		}),
	);

	await page.route(/\/api\/models(?:[/?].*)?$/, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				models: [
					{ id: "gpt-4", name: "GPT-4" },
					{ id: "gpt-5-mini", name: "GPT-5 Mini" },
				],
				total: 2,
				limit: 20,
				offset: 0,
			}),
		}),
	);
}

export async function setupAdminPage(page: Page) {
	await mockAdminBootstrap(page);
}

export async function renderAdminRoute(page: Page, pathname: string) {
	await page.goto("/");
	await page.waitForSelector("#app", { state: "visible", timeout: 15000 });
	await page.evaluate((targetPath) => {
		window.history.pushState({}, "", targetPath);
		window.dispatchEvent(new PopStateEvent("popstate"));
	}, pathname);
	await page.waitForLoadState("networkidle");
	await page.waitForSelector("#app", { state: "visible", timeout: 15000 });
}
