import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TEST_URL = "http://127.0.0.1:8787";
const PLAYWRIGHT_AUTH_STATE_PATH = path.join(".playwright", "auth-state.json");

/**
 * @typedef {{
 * 	origin?: string,
 * 	authState?: unknown,
 * 	includeDefaultModelId?: boolean,
 * }} TestStorageStateOptions
 */

/**
 * @param {string | null | undefined} value
 */
function normalizeTestUrl(value) {
	const raw = String(value ?? "").trim();
	if (!raw) return DEFAULT_TEST_URL;
	return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function resolveTestUrl() {
	return normalizeTestUrl(
		process.env.TEST_URL ||
			process.env.PLAYWRIGHT_TEST_BASE_URL ||
			DEFAULT_TEST_URL,
	);
}

export function resolveTestOrigin() {
	return new URL(resolveTestUrl()).origin;
}

export const TEST_JWT =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6IjEiLCJuYW1lIjoiVGVzdCJ9.signature";

export function createTestStorageState(options = {}) {
	const typedOptions = /** @type {TestStorageStateOptions} */ (options);
	const {
		origin = resolveTestOrigin(),
		authState,
		includeDefaultModelId = true,
	} = typedOptions;
	if (!authState) {
		throw new Error("authState is required to create Playwright storageState");
	}
	const localStorage = [
		{
			name: "growchat_auth",
			value: JSON.stringify(authState),
		},
	];

	if (includeDefaultModelId) {
		localStorage.push({
			name: "defaultModelId",
			value: "openai/draft-zomkzxao:deepseek-v3.2",
		});
	}

	return {
		cookies: [],
		origins: [
			{
				origin,
				localStorage,
			},
		],
	};
}

export async function preparePlaywrightAuthStorageStateFile({
	baseURL = resolveTestUrl(),
	email = process.env.TEST_EMAIL,
	password = process.env.TEST_PASSWORD,
	includeDefaultModelId = true,
	outputPath = PLAYWRIGHT_AUTH_STATE_PATH,
} = {}) {
	if (!email || !password) {
		throw new Error(
			"TEST_EMAIL and TEST_PASSWORD are required to prepare Playwright auth storageState",
		);
	}

	const normalizedBaseUrl = normalizeTestUrl(baseURL);
	const loginUrl = new URL("/api/auth/login", normalizedBaseUrl).toString();
	const res = await fetch(loginUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password }),
	});

	if (!res.ok) {
		const errorBody = await res.text().catch(() => "");
		throw new Error(
			`Playwright auth login failed (${res.status} ${res.statusText}): ${errorBody}`,
		);
	}

	const authState = await res.json();
	const storageState = createTestStorageState({
		origin: new URL(normalizedBaseUrl).origin,
		authState,
		includeDefaultModelId,
	});

	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, JSON.stringify(storageState, null, 2));
	return outputPath;
}
