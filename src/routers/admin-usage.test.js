import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createDB: vi.fn(),
	authorize: vi.fn(),
	logAuditEvent: vi.fn(),
	getConfigBool: vi.fn(),
	getConfigValue: vi.fn(),
	setConfigValue: vi.fn(),
	getAllOpenAIConnectionConfigs: vi.fn(),
	buildConnectionHeaders: vi.fn(),
	discoverConnectionModels: vi.fn(),
	mcpRequest: vi.fn(),
	mcpNotify: vi.fn(),
	isSafeOutboundUrl: vi.fn(() => ({ safe: true })),
}));

vi.mock('../db.js', () => ({
	createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../utils/authorize.js', () => ({
	authorize: (...args) => mocks.authorize(...args),
	logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../utils/app-config.js', () => ({
	getConfigBool: (...args) => mocks.getConfigBool(...args),
	getConfigValue: (...args) => mocks.getConfigValue(...args),
	setConfigValue: (...args) => mocks.setConfigValue(...args),
}));

vi.mock('../llm/connections.js', () => ({
	buildConnectionHeaders: (...args) => mocks.buildConnectionHeaders(...args),
	discoverConnectionModels: (...args) => mocks.discoverConnectionModels(...args),
	ensureConnectionId: (conn, index = 0) => conn?.id || `conn-${index}`,
	extractConnectionModelId: vi.fn((item) => item?.id || item?.model || item?.name || ''),
	getAllOpenAIConnectionConfigs: (...args) => mocks.getAllOpenAIConnectionConfigs(...args),
	getConnectionApiType: vi.fn(() => 'chat-completions'),
	getConnectionDefaultBaseUrl: vi.fn(() => 'https://api.openai.com/v1'),
	isConnectionUrlRequired: vi.fn(() => false),
	normalizeConnectionManualModels: (value) => value || [],
	normalizeProviderFamily: vi.fn(() => 'openai'),
}));

vi.mock('../mcp/client.js', () => ({
	MCP_PROTOCOL_VERSION: '2024-11-05',
	mcpNotify: (...args) => mocks.mcpNotify(...args),
	mcpRequest: (...args) => mocks.mcpRequest(...args),
}));

vi.mock('../utils/validation.js', () => ({
	isSafeOutboundUrl: (...args) => mocks.isSafeOutboundUrl(...args),
}));

vi.mock('../admin/tool-servers.js', () => ({
	buildAuthorizationUrl: vi.fn(),
	discoverAuthorizationMetadata: vi.fn(),
	isValidHttpUrl: vi.fn(() => true),
	loadToolServers: vi.fn(),
	mergeToolServer: vi.fn(),
	mergeToolSpecs: vi.fn(),
	normalizeAuthType: vi.fn(),
	normalizeAttachmentCaps: vi.fn(),
	normalizeBaseUrl: vi.fn(),
	normalizeHeaders: vi.fn(),
	normalizeModelId: vi.fn(),
	normalizeTokenAuthMethod: vi.fn(),
	parseHeadersForRequest: vi.fn(() => ({})),
	randomString: vi.fn(() => 'test-random'),
	redactToolServer: vi.fn(),
	saveToolServers: vi.fn(),
	selectTokenAuthMethod: vi.fn(),
	sha256Base64Url: vi.fn(() => 'test-hash'),
}));

vi.mock('../../public/js/shared/utils/connection-model-selection.js', () => ({
	normalizeConnectionModelSelectionMode: vi.fn(() => 'all'),
}));

vi.mock('../utils/connection-acl.js', () => ({
	buildConnectionAclRuleSaveStatements: vi.fn(() => ({ statements: [] })),
	loadConnectionAclRules: vi.fn(() => []),
	normalizeConnectionAclRule: vi.fn(),
	saveConnectionAclRulesForConnection: vi.fn(() => []),
}));

vi.mock('../utils/tool-server-acl.js', () => ({
	buildToolServerAclRuleSaveStatements: vi.fn(() => ({ statements: [] })),
	loadToolServerAclRules: vi.fn(() => []),
	normalizeToolServerAclRule: vi.fn(),
	saveToolServerAclRulesForToolServer: vi.fn(() => []),
}));

import { adminRouter } from './admin.js';

function makeReq(path, method = 'GET') {
	return new Request(`https://example.com${path}`, { method });
}

/** Creates a chainable mock query: .bind().first() / .all() */
function mockChain(result) {
	return { bind: () => mockChain(result), first: () => Promise.resolve(result), all: () => Promise.resolve({ results: result }) };
}

/** Creates a mock DB with sequential query results for the usage endpoint. */
function makeMockDb(o = {}) {
	const d = {
		total: o.totalUsers ?? 10, a7: o.activeUsers7d ?? 5, a30: o.activeUsers30d ?? 8,
		pa7: o.prevActiveUsers7d ?? 3, pa30: o.prevActiveUsers30d ?? 6,
		daily: o.dailyMessages ?? [{ day: '2026-05-19', count: 42 }],
		weekly: o.weeklyMessages ?? [{ week: '2026-W20', count: 150 }],
		pd: o.prevDailyTotal ?? 30, pw: o.prevWeeklyTotal ?? 120,
		s30: o.sparks30d ?? 25, ps30: o.prevSparks30d ?? 20, ts: o.totalSparks ?? 100,
	};
	// Query order: total, a7, a30, pa7, pa30, daily(.all), weekly(.all), pd, pw, s30, ps30, ts
	const results = [
		{ count: d.total }, { count: d.a7 }, { count: d.a30 }, { count: d.pa7 }, { count: d.pa30 },
		d.daily, d.weekly, { count: d.pd }, { count: d.pw }, { count: d.s30 }, { count: d.ps30 }, { count: d.ts },
	];
	let i = 0;
	return {
		prepare: vi.fn(() => {
			const idx = i++;
			const r = results[idx] ?? { count: 0 };
			return mockChain(r);
		}),
	};
}

describe('adminRouter GET /api/admin/usage', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.authorize.mockResolvedValue({ allow: true });
		mocks.logAuditEvent.mockResolvedValue(undefined);
		mocks.getConfigBool.mockResolvedValue(true);
		mocks.getConfigValue.mockResolvedValue('[]');
		mocks.setConfigValue.mockResolvedValue(undefined);
		mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
		mocks.buildConnectionHeaders.mockReturnValue({});
		mocks.discoverConnectionModels.mockResolvedValue({ items: [], url: '' });
	});

	it('returns 403 when authorization fails', async () => {
		mocks.authorize.mockResolvedValue({ allow: false, reason: 'Forbidden' });
		const db = makeMockDb();
		mocks.createDB.mockReturnValue(db);

		const res = await adminRouter(
			makeReq('/api/admin/usage'),
			{},
			{},
			{ sub: 'user-1' },
			'/api/admin/usage'
		);
		expect(res.status).toBe(403);
	});

	it('returns usage metrics with correct structure', async () => {
		const db = makeMockDb();
		mocks.createDB.mockReturnValue(db);

		const res = await adminRouter(
			makeReq('/api/admin/usage'),
			{},
			{},
			{ sub: 'admin-1' },
			'/api/admin/usage'
		);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body).toHaveProperty('users');
		expect(body).toHaveProperty('messages');
		expect(body).toHaveProperty('sparks');

		expect(body.users).toHaveProperty('total');
		expect(body.users).toHaveProperty('active_7d');
		expect(body.users).toHaveProperty('active_30d');
		expect(body.users).toHaveProperty('prev_active_7d');
		expect(body.users).toHaveProperty('prev_active_30d');

		expect(body.messages).toHaveProperty('daily');
		expect(body.messages).toHaveProperty('weekly');
		expect(body.messages).toHaveProperty('daily_total');
		expect(body.messages).toHaveProperty('prev_daily_total');
		expect(body.messages).toHaveProperty('weekly_total');
		expect(body.messages).toHaveProperty('prev_weekly_total');

		expect(body.sparks).toHaveProperty('total');
		expect(body.sparks).toHaveProperty('last_30d');
		expect(body.sparks).toHaveProperty('prev_30d');
	});

	it('returns numeric values for user metrics', async () => {
		const db = makeMockDb({
			totalUsers: 42,
			activeUsers7d: 10,
			activeUsers30d: 25,
		});
		mocks.createDB.mockReturnValue(db);

		const res = await adminRouter(
			makeReq('/api/admin/usage'),
			{},
			{},
			{ sub: 'admin-1' },
			'/api/admin/usage'
		);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.users.total).toBe(42);
		expect(typeof body.users.active_7d).toBe('number');
		expect(typeof body.users.active_30d).toBe('number');
	});

	it('returns array data for daily and weekly messages', async () => {
		const db = makeMockDb({
			dailyMessages: [
				{ day: '2026-05-19', count: 42 },
				{ day: '2026-05-18', count: 30 },
			],
			weeklyMessages: [{ week: '2026-W20', count: 150 }],
		});
		mocks.createDB.mockReturnValue(db);

		const res = await adminRouter(
			makeReq('/api/admin/usage'),
			{},
			{},
			{ sub: 'admin-1' },
			'/api/admin/usage'
		);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(Array.isArray(body.messages.daily)).toBe(true);
		expect(Array.isArray(body.messages.weekly)).toBe(true);
	});

	it('returns 500 when database queries fail', async () => {
		const db = {
			prepare: vi.fn(() => {
				throw new Error('Database error');
			}),
		};
		mocks.createDB.mockReturnValue(db);

		const res = await adminRouter(
			makeReq('/api/admin/usage'),
			{},
			{},
			{ sub: 'admin-1' },
			'/api/admin/usage'
		);
		expect(res.status).toBe(500);
	});

	it('returns null for unrecognized admin paths', async () => {
		mocks.createDB.mockReturnValue(makeMockDb());
		const res = await adminRouter(
			makeReq('/api/admin/nonexistent'),
			{},
			{},
			{ sub: 'admin-1' },
			'/api/admin/nonexistent'
		);
		expect(res).toBeNull();
	});
});
