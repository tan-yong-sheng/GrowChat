// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	apiFetch: vi.fn(),
	ensureMarkedReady: vi.fn(),
}));

vi.mock("../../public/js/shared/api.js", () => ({
	apiFetch: (...args) => mocks.apiFetch(...args),
}));

vi.mock("../../public/js/shared/utils.js", () => ({
	ensureMarkedReady: (...args) => mocks.ensureMarkedReady(...args),
}));

async function loadModule() {
	vi.resetModules();
	const { renderAccountPage } = await import(
		"../../public/js/features/account/account.js"
	);
	return { renderAccountPage };
}

function makeAccountState() {
	const capabilities = {
		permissions: [
			"chat.read",
			"user.settings.profile.write",
			"user.settings.preferences.write",
			"user.settings.connections.write",
			"user.settings.integrations.write",
			"user.settings.tool-servers.write",
		],
		canManageConnections: true,
		canManageToolServers: true,
		canManageModels: true,
		canManageAcls: false,
	};
	return {
		user: {
			id: "u1",
			name: "Sam",
			email: "sam@example.com",
			primary_role: "member",
			avatar_emoji: "S",
			status: "online",
		},
		permissions: capabilities.permissions,
		roles: [{ role_name: "member" }],
		capabilities,
		app_config: { default_model_id: "gpt-5-mini" },
		settings: {
			general: {
				name: "Sam",
				email: "sam@example.com",
				avatar: null,
				avatar_emoji: "S",
				status: "online",
				account_status: "active",
				settings: {},
			},
			preferences: { theme: "system" },
			connections: { my_connections: [], connections: [] },
			integrations: { servers: [] },
			tool_servers: { servers: [] },
			models: { default_model_id: null },
		},
	};
}

describe("account shell tabs", () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="app"></div>';
		localStorage.clear();
		mocks.ensureMarkedReady.mockReset();
		mocks.apiFetch.mockReset();
	});

	it("renders the Settings tab on the account route", async () => {
		window.history.pushState({}, "", "/account/settings/connections");
		mocks.apiFetch.mockResolvedValue({
			ok: true,
			json: async () => makeAccountState(),
		});

		const { renderAccountPage } = await loadModule();
		await renderAccountPage(document.getElementById("app"));

<<<<<<< HEAD
    const tabs = Array.from(document.querySelectorAll('[data-account-area-tab]'));
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Settings']);
    expect(tabs[0].getAttribute('href')).toBe('/account/settings/connections');
    expect(tabs[0].className).toContain('text-gray-900');
    expect(tabs[0].className).toContain('underline');
    expect(document.querySelector('#account-settings-drawer')).not.toBeNull();
    expect(document.querySelector('#account-settings-overlay')).not.toBeNull();
    expect(document.querySelector('#account-settings-close')).not.toBeNull();
    expect(document.querySelector('#account-main-footer')).not.toBeNull();

    const innerTabs = Array.from(
      document.querySelectorAll('#account-tabs-container [data-subnav]')
    );
    expect(innerTabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Connections',
      'Models',
      'Integrations',
    ]);
  }, 10000);
=======
		const tabs = Array.from(
			document.querySelectorAll("[data-account-area-tab]"),
		);
		expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["Settings"]);
		expect(tabs[0].getAttribute("href")).toBe("/account/settings/connections");
		expect(tabs[0].className).toContain("text-gray-900");
		expect(tabs[0].className).toContain("underline");
		expect(document.querySelector("#account-settings-drawer")).not.toBeNull();
		expect(document.querySelector("#account-settings-overlay")).not.toBeNull();
		expect(document.querySelector("#account-settings-close")).not.toBeNull();
		expect(document.body.textContent).toContain("Settings");
		expect(document.querySelector("#account-main-footer")).not.toBeNull();

		const innerTabs = Array.from(
			document.querySelectorAll("#account-tabs-container [data-subnav]"),
		);
		expect(innerTabs.map((tab) => tab.textContent?.trim())).toEqual([
			"Connections",
			"Models",
			"Integrations",
			"Sessions",
		]);
		expect(document.querySelector('[data-subnav="sessions"]')).not.toBeNull();
	}, 10000);
>>>>>>> feature/short-term-tasks

	it("keeps Settings active on a settings subsection route", async () => {
		window.history.pushState({}, "", "/account/settings/connections");
		mocks.apiFetch.mockResolvedValue({
			ok: true,
			json: async () => makeAccountState(),
		});

		const { renderAccountPage } = await loadModule();
		await renderAccountPage(document.getElementById("app"));

<<<<<<< HEAD
    const tabs = Array.from(document.querySelectorAll('[data-account-area-tab]'));
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Settings']);
    expect(tabs[0].getAttribute('href')).toBe('/account/settings/connections');
    expect(tabs[0].className).toContain('text-gray-900');
    expect(tabs[0].className).toContain('underline');
    expect(document.querySelector('#account-settings-drawer')).not.toBeNull();
    expect(document.querySelector('h1')).toBeNull();
    expect(document.body.textContent).toContain('Settings');
    expect(document.querySelector('[data-subnav="connections"]')?.className).toContain(
      'bg-gray-100'
    );
    expect(document.querySelector('#account-main-footer')).not.toBeNull();

    const innerTabs = Array.from(
      document.querySelectorAll('#account-tabs-container [data-subnav]')
    );
    expect(innerTabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Connections',
      'Models',
      'Integrations',
    ]);
  });
=======
		const tabs = Array.from(
			document.querySelectorAll("[data-account-area-tab]"),
		);
		expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["Settings"]);
		expect(tabs[0].getAttribute("href")).toBe("/account/settings/connections");
		expect(tabs[0].className).toContain("text-gray-900");
		expect(tabs[0].className).toContain("underline");
		expect(document.querySelector("#account-settings-drawer")).not.toBeNull();
		expect(document.querySelector("h1")).toBeNull();
		expect(document.body.textContent).toContain("Settings");
		expect(
			document.querySelector('[data-subnav="connections"]')?.className,
		).toContain("bg-gray-100");
		expect(document.querySelector("#account-main-footer")).not.toBeNull();

		const innerTabs = Array.from(
			document.querySelectorAll("#account-tabs-container [data-subnav]"),
		);
		expect(innerTabs.map((tab) => tab.textContent?.trim())).toEqual([
			"Connections",
			"Models",
			"Integrations",
			"Sessions",
		]);
		expect(document.querySelector('[data-subnav="sessions"]')).not.toBeNull();
	});
>>>>>>> feature/short-term-tasks

	it("renders the shared workspace sidebar chrome", async () => {
		window.history.pushState({}, "", "/account/settings/connections");
		mocks.apiFetch.mockResolvedValue({
			ok: true,
			json: async () => makeAccountState(),
		});

		const { renderAccountPage } = await loadModule();
		await renderAccountPage(document.getElementById("app"));

		expect(document.querySelector("#workspace-home-link")).toBeTruthy();
		expect(document.querySelector("#new-chat")).toBeTruthy();
		expect(document.querySelector("#open-search")).toBeTruthy();
		expect(document.querySelector("#sidebar")).toBeTruthy();
	});
});
