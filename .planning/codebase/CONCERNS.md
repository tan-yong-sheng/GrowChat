# Codebase Concerns

**Analysis Date:** [YYYY-MM-DD]

## Tech Debt

**Monolithic Route Handlers:**
- Issue: Router files are massive monoliths (1,000+ lines) where all endpoints for a domain are sequentially checked in a single exported function via `if (req.method === 'X' && path === 'Y')`.
- Files: `src/routers/admin.js`, `src/routers/models.js`, `src/routers/users.js`
- Impact: High cognitive load, difficulty testing isolated endpoints, and higher likelihood of merge conflicts.
- Fix approach: Implement a lightweight internal router tree (like Hono) or split each endpoint handler into its own cohesive module/function.

**Silent Error Swallowing in Streaming:**
- Issue: There are multiple empty `catch { }` blocks wrapping critical paths like emitting SSE events or persisting database deltas during streaming.
- Files: `src/chat/assistant-runner.js`, `src/chat/stream-lifecycle.js`, `src/chat/mcp.js`, `public/js/features/chat/chat-stream-controller.js`
- Impact: If the database write fails or a connection drops unexpectedly, the system silently ignores it, leading to unrecorded message deltas or broken UI states without logs.
- Fix approach: Log these errors explicitly at a debug/warn level, and properly handle or retry database persistence if it fails during streaming.

**Defensive "Return Null" Pattern:**
- Issue: Widespread pattern of returning `null` or `[]` immediately if early validation fails, rather than throwing contextual errors.
- Files: `public/js/shared/utils/connection-sync.js`, `src/admin/tool-servers.js`, `public/js/features/chat/chat-message-utils.js`
- Impact: Errors are masked as "empty states" instead of surfacing root causes to the calling layers, leading to confusing bugs where data just appears missing.
- Fix approach: Throw specific validation errors (`new Error('Missing required field')`) and handle them gracefully at the boundary/UI layers.

## Security Considerations

**Tool Servers SSRF Risk:**
- Risk: The system permits dynamic configuration of "tool servers" by URL. If there are no internal network blocks in place, it might allow Server-Side Request Forgery (SSRF) against internal VPC or local resources.
- Files: `src/admin/tool-servers.js`, `src/routers/admin.js`
- Current mitigation: Basic `http://` or `https://` URL string validation exists, but does not restrict local IPs.
- Recommendations: Ensure the Worker environment or fetch client blocks requests to internal IP address ranges or localhost, unless specifically allowed.

## Performance Bottlenecks

**Unpaginated Full Table Loads:**
- Problem: Queries fetching all groups or connections without limit or cursor-based pagination.
- Files: `src/routers/admin.js` (`SELECT id FROM groups`)
- Cause: Simple queries for relatively small configuration tables, but they scale linearly with user/group growth.
- Improvement path: Introduce pagination or scoped queries if the user/group counts grow beyond typical enterprise bounds.

## Fragile Areas

**Chat Stream Controller:**
- Files: `public/js/features/chat/chat-stream-controller.js`, `src/chat/assistant-runner.js`
- Why fragile: State transitions between the LLM generator, database saving, and UI stream consumption are spread across heavily nested loops and try-catch blocks with hardcoded timeouts (e.g. 10 mins).
- Safe modification: Altering this requires end-to-end testing of streaming under slow network conditions. Avoid modifying the `while` loops without extensive unit test harnesses for edge cases.
- Test coverage: Error paths (like database `db.run` failing mid-stream) are silently caught and likely lack explicit test coverage.

## Test Coverage Gaps

**Stream Lifecycle Error Paths:**
- What's not tested: How the application recovers from mid-stream failures, database disconnects, or SSE drops.
- Files: `src/chat/stream-lifecycle.js`, `src/chat/assistant-runner.js`
- Risk: Users might be left with hanging generation states, or deltas will fail to save without the user realizing.
- Priority: High

---

*Concerns audit: [YYYY-MM-DD]*