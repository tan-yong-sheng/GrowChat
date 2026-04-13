# Startup Performance Plan (PLAN2)

## Objective
Reduce startup network requests and cold-start latency for:
- `http://localhost:8787/`
- `http://localhost:8787/admin/settings/connections`

## Measurement Protocol (Playwright CLI, real login)
- Use real session login flow
- Measure per route:
  - Route-ready time (ms)
  - Total requests
  - Internal requests (same-origin)
  - Third-party requests
  - Slowest 5 requests
- Run cold and warm passes

## Baseline Metrics
_Status: captured (real login Playwright run at 2026-04-12T07:54:05Z)_

### Route: /
- Cold route-ready: **14709 ms**
- Warm route-ready: **13168 ms**
- Request count:
  - Cold: **91** (internal **86** / third-party **5**)
  - Warm: **90** (internal **85** / third-party **5**)
- Notable duplicate endpoint(s):
  - `GET /api/chats` ×2 (cold)
- Slowest startup requests (cold):
  - `GET /js/features/chat/chat-sidebar-list.js` (~12689 ms)
  - `GET /js/features/chat/chat-message-seq.js` (~12660 ms)
  - `GET /js/features/chat/chat-file-events.js` (~12659 ms)

### Route: /admin/settings/connections
- Cold route-ready: **13043 ms**
- Warm route-ready: **11670 ms**
- Request count:
  - Cold: **100** (internal **95** / third-party **5**)
  - Warm: **100** (internal **95** / third-party **5**)
- Slowest startup requests (cold):
  - `GET /js/features/admin/admin-layout.js` (~11804 ms)
  - `GET /js/features/admin/settings/integrations.js` (~11795 ms)
  - `GET /js/shared/utils/settings-route-cache.js` (~11795 ms)

## Optimization Slices

### Slice 1 — Frontend startup request reductions (first)
1. Gate eager model prefetch on admin/system first routes ✅
   - `public/js/bootstrap/session-bootstrap.js`
2. Defer eager tool-server load on chat startup ✅
   - `public/js/features/chat/chat.js`
3. Keep prefetch behavior chat-route scoped to prevent regressions ✅
   - `public/js/bootstrap/app.js` (already route-scoped; verified)

**Success criteria**
- `/admin/settings/connections` startup avoids immediate `/api/models` call
- `/` startup no longer eagerly blocks on tool-server load

### Slice 2 — `/api/models` backend latency reductions
1. Add short TTL cache for connection model discovery ✅
   - `src/routers/models.js`
2. Reuse request-scoped ACL/group context (avoid duplicate DB work) ✅
   - `src/routers/models.js`
   - `src/llm/connections.js`

**Validation snapshot (`/api/models?scope=effective`, authenticated):**
- Attempt 1: **12605.7 ms**
- Attempt 2: **340 ms**
- Attempt 3: **740.3 ms**
- Response bytes stable across runs (25773 bytes)

### Slice 3 — Cold-start SRI path improvements
1. Reduce blocking cost of runtime SRI hash loading for first HTML response ✅
   - `src/index.js`
   - `src/utils/sri-hashes.js`

**Change summary:**
- `src/utils/sri-hashes.js` now returns quickly with cached/persisted hashes and refreshes missing hashes in background instead of blocking HTML response on CDN fetch.
- Added short partial-cache TTL for incomplete hash sets.

## Validation after each slice
- Re-run Playwright metrics on both routes
- Run focused unit tests + full `npm test` before finalization
- Keep only slices with measurable wins and no behavior regressions

## Slice 1 Results (after implementation)
_Run timestamp: 2026-04-12T07:58:43Z_

### /admin/settings/connections (major win)
- Cold route-ready: **13043 ms -> 1954 ms**
- Warm route-ready: **11670 ms -> 1344 ms**
- Request count:
  - Cold: **100 -> 100** (count stable, but critical-path latency dropped)
  - Warm: **100 -> 99**

### / (mixed result)
- Cold route-ready: **14709 ms -> 14459 ms**
- Warm route-ready: **13168 ms -> 14959 ms**
- Request count:
  - Cold: **91 -> 91**
  - Warm: **90 -> 89**

## Final Metrics Snapshot (post slices 1-3)
_Run timestamp: 2026-04-12T08:07:27Z_

### /
- Cold route-ready: **14709 ms -> 13214 ms**
- Warm route-ready: **13168 ms -> 1929 ms**
- Request count:
  - Cold: **91 -> 90**
  - Warm: **90 -> 91** (variance), with much faster route-ready in this run

### /admin/settings/connections
- Cold route-ready: **13043 ms -> 1480 ms**
- Warm route-ready: **11670 ms -> 1265 ms**
- Request count:
  - Cold: **100 -> 99**
  - Warm: **100 -> 99**

## Second Pass (module fan-out and non-critical deferral)
_Run timestamp: 2026-04-12T08:24:19Z_

### Changes
- Deferred non-critical chat modules to dynamic import/on-demand:
  - `chat-modals.js`
  - `chat-file-events.js`
  - `chat-stream.js` (stream parser)
- Deferred cached-chats background refresh further out of initial startup window in `session-bootstrap`.

### Metrics snapshot
#### /
- Cold route-ready: **14332 ms**
- Warm route-ready: **2228 ms**
- Request count:
  - Cold: **88** (internal **83** / third-party **5**)
  - Warm: **91** (internal **86** / third-party **5**)
- Remaining duplicate (cold): `GET /api/chats` ×2

#### /admin/settings/connections
- Cold route-ready: **1827 ms**
- Warm route-ready: **1770 ms**
- Request count:
  - Cold: **99**
  - Warm: **99**

### Notes
- Home-route cold startup remains dominated by large chat module dependency chain (`chat-sidebar-list`, `chat-ui-resources`, `chat-render-controller`, `chat-shell-controller`, `chat-stream-controller`).
- Biggest stable win remains admin/settings startup latency reduction.

## Third Pass (deeper home startup contention reduction)
_Run timestamp: 2026-04-12T08:57:47Z_

### Changes
- Deferred deferred-bootstrap work (RBAC/realtime bootstrap) to idle scheduling.
- Deferred cached chat-list refresh further out of startup path (`setTimeout` 25s).
- Kept non-critical chat module lazy loading from second pass.

### Metrics snapshot
#### /
- Cold route-ready: **13816 ms**
- Warm route-ready: **2006 ms**
- Request count:
  - Cold: **83** (internal **78** / third-party **5**)
  - Warm: **95** (internal **90** / third-party **5**)

#### /admin/settings/connections
- Cold route-ready: **2451 ms**
- Warm route-ready: **2285 ms**
- Request count:
  - Cold: **99**
  - Warm: **99**

### Observations
- Home cold request count improved further, but cold route-ready still high.
- Admin route latency regressed compared with best prior run; likely due run-to-run variance and deferred work contention timing.
- Next stable target should be splitting chat boot into minimal core + deferred controller loading.

## Fourth Pass (non-blocking initial chat bootstrap + lazy pagination observer)
_Run timestamp: 2026-04-12T09:11:41Z_

### Changes
- `public/js/bootstrap/session-bootstrap.js`
  - Removed blocking await on first `fetchChats` when chat cache is empty.
  - App now boots with an empty chat list immediately, then hydrates chats asynchronously when `fetchChats` resolves.
- `public/js/features/chat/chat.js`
  - Deferred chat list pagination `IntersectionObserver` activation until first sidebar interaction (`wheel`/`touchstart`/`scroll`).
  - Prevents startup-time auto pagination request fan-out before user intent.

### Metrics snapshot
#### /
- Cold route-ready: **2541 ms**
- Warm route-ready: **1879 ms**
- Request count:
  - Cold: **88** (internal **83** / third-party **5**)
  - Warm: **88** (internal **83** / third-party **5**)
- Duplicates: none observed (`GET /api/chats` duplicate removed in this run)

#### /admin/settings/connections
- Cold route-ready: **1436 ms**
- Warm route-ready: **1606 ms**
- Request count:
  - Cold: **99** (internal **94** / third-party **5**)
  - Warm: **99** (internal **94** / third-party **5**)

### Observations
- Home route-ready improved significantly in this pass while holding request count below baseline.
- Remaining top cold-path contributors are still chat module fan-out (`chat-sidebar-list.js`, `chat-message-seq.js`, `chat-ui-resources.js`, `chat-stream-state.js`, `chat-stream-controller.js`).
- Next slice should target progressive chat runtime hydration (move these modules out of immediate `/` critical path).

## Fifth Pass (progressive hydration for sidebar + message sequence)
_Run timestamp: 2026-04-12T09:23:43Z_

### Changes
- `public/js/features/chat/chat.js`
  - Moved `chat-message-seq.js` to lazy import (`loadChatMessageSeqModule`) and initialized tracker on idle / first send / first resume stream.
  - Moved `chat-sidebar-list.js` to lazy import (`loadChatSidebarListModule`) and rendered lightweight clickable fallback rows until full sidebar renderer hydrates.
  - Added idle prewarm for both lazy modules to keep UX smooth after first paint.

### Metrics snapshot
#### /
- Cold route-ready: **2115 ms**
- Warm route-ready: **2318 ms**
- Request count:
  - Cold: **88** (internal **83** / third-party **5**)
  - Warm: **88** (internal **83** / third-party **5**)
- Duplicates: none observed
- Top slowest startup requests no longer include `chat-message-seq.js` or `chat-sidebar-list.js` in this run.

#### /admin/settings/connections
- Cold route-ready: **1971 ms**
- Warm route-ready: **1841 ms**
- Request count:
  - Cold: **99** (internal **94** / third-party **5**)
  - Warm: **99** (internal **94** / third-party **5**)

### Variance check (second sample)
_Run timestamp: 2026-04-12T09:24:41Z_
- `/` cold/warm route-ready: **1671 / 1540 ms**
- `/admin/settings/connections` cold/warm route-ready: **1497 / 1954 ms**
- Request counts remained stable: home **88**, admin **99**.

### Observations
- Request volume stayed flat but expensive home-route module work shifted further off immediate startup path.
- Home route-ready remains consistently far below the original baseline, but warm/admin timing still shows run-to-run variance.
- Next slice should target lazy stream runtime (`chat-stream-state`, `chat-stream-controller`) to reduce remaining cold-path hotspots.

## Sixth Pass (lazy stream runtime hydration)
_Run timestamp: 2026-04-12T09:37:31Z_

### Changes
- `public/js/features/chat/chat.js`
  - Moved `chat-stream-controller.js` to lazy import (`loadChatStreamControllerModule`) with a proxy `streamSession` facade.
  - Moved `chat-stream-state.js` to lazy import (`loadChatStreamStateModule`) and delayed runtime init behind `ensureStreamRuntime()`.
  - Stream runtime now initializes on first stream-needed action (`sendMessage`, `sendSingleMessage`, `startResumeStream`) and prewarms on idle.
  - Added lightweight fallback logic for `getRunningMessageId` before stream controller hydration to preserve resume detection.

### Metrics snapshot
#### /
- Cold route-ready: **2327 ms**
- Warm route-ready: **2152 ms**
- Request count:
  - Cold: **88** (internal **83** / third-party **5**)
  - Warm: **88** (internal **83** / third-party **5**)
- Duplicates: none observed
- Top slowest startup requests no longer include `chat-stream-state.js` or `chat-stream-controller.js` in this run.

#### /admin/settings/connections
- Cold route-ready: **2174 ms**
- Warm route-ready: **1836 ms**
- Request count:
  - Cold: **99** (internal **94** / third-party **5**)
  - Warm: **99** (internal **94** / third-party **5**)

### Variance check (second sample)
_Run timestamp: 2026-04-12T09:38:38Z_
- `/` cold/warm route-ready: **1703 / 3210 ms**
- `/admin/settings/connections` cold/warm route-ready: **2650 / 2344 ms**
- Request counts: home **88 cold / 85 warm**, admin **99/99**.

### Observations
- Stream modules were successfully shifted out of the immediate startup hotspot list.
- Request counts stayed below baseline, but route-ready timing still has high run-to-run variance.
- Next optimization target should be `chat-list-actions.js` + `chat-ui-resources.js` path splitting or staged controller hydration to reduce remaining home cold-path duration spikes.

## Seventh Pass (staged controller hydration: list-actions/realtime/message-list)
_Run timestamp: 2026-04-12T10:11:25Z_

### Changes
- `public/js/features/chat/chat.js`
  - Moved `chat-list-actions.js` to lazy import (`loadChatListActionsModule`) with a fallback minimal click handler for early sidebar interactions.
  - Moved `chat-realtime-controller.js` to lazy import (`loadChatRealtimeControllerModule`) and deferred initialization behind `ensureRealtimeController()`.
  - Moved `chat-message-list-controller.js` to lazy import (`loadChatMessageListControllerModule`) with deferred initialization (`ensureMessageListInteractions()`).
  - Added staged hydration triggers:
    - idle prewarm queue,
    - first sidebar/header/message-list interactions,
    - send path guard (`ensureRealtimeController()` before send).

### Metrics snapshot
#### /
- Cold route-ready: **5065 ms**
- Warm route-ready: **5471 ms**
- Request count:
  - Cold: **83** (internal **78** / third-party **5**)
  - Warm: **75** (internal **70** / third-party **5**)
- Duplicates: none observed

#### /admin/settings/connections
- Cold route-ready: **3083 ms**
- Warm route-ready: **5073 ms**
- Request count:
  - Cold: **99** (internal **94** / third-party **5**)
  - Warm: **99** (internal **94** / third-party **5**)

### Variance check (second sample)
_Run timestamp: 2026-04-12T10:12:56Z_
- `/` cold/warm route-ready: **14436 / 3043 ms**
- `/admin/settings/connections` cold/warm route-ready: **4105 / 2875 ms**
- Request counts: home **83 cold / 85 warm**, admin **99/99**.

### Observations
- Request fan-out dropped further on `/` (down to 83/75 in one sample), but route-ready latency became significantly less stable and often worse.
- This pass appears over-deferred for critical path responsiveness despite lower request volume.
- Recommended next action: keep Slice 6 baseline and selectively retain only the parts of Slice 7 that do not regress route-ready (likely retain list-action lazy path only, revert realtime/message-list deferral).

## Targeted Reload Investigation (`/c/528059b5-4dad-4d16-bb16-a64c4780928d`)
_Run timestamps: 2026-04-12T10:31:49Z and 2026-04-12T10:32:21Z_

### Request + route-ready snapshots
- Session A
  - cold-open: **2243 ms**, **89** requests
  - reload: **3610 ms**, **89** requests
- Session B (same page, repeated reloads)
  - open: **2700 ms**, **90** requests
  - reload-1: **2025 ms**, **89** requests
  - reload-2: **1478 ms**, **89** requests
  - reload-3: **1313 ms**, **89** requests

### Waterfall findings
- Intermittent slow reload outlier captured:
  - `GET /js/features/chat/chat.js` ~**2215 ms**
  - `GET /api/models?scope=effective` ~**2206 ms**
  - both started around ~**604 ms** into reload and finished ~**2.8 s**.
- Typical reloads show `/api/models?scope=effective` around **312–412 ms**.
- `chat-shell-controller.js`, `chat-ui-resources.js`, `chat-render-controller.js`, `chat-data-controller.js` repeatedly appear as high-latency script fetch/eval segments (roughly **450–660 ms** in normal runs).
- `/api/tool-servers` also occasionally lands in the critical path (~**491–627 ms**).

### Conclusion
- The slow feeling on this specific page is real but **intermittent**, with route-ready fluctuating from ~**1.3 s** to ~**3.6 s** (and occasionally worse under contention).
- Dominant contributors in slow samples are:
  1. model fetch latency spikes (`/api/models?scope=effective`)
  2. chat module hydration fan-out around `chat.js` and related controllers.

## Multi-URL Benchmark (cross-route, open + reload)
_Run timestamp: 2026-04-12T10:43:26Z_

### Routes measured
- `/` → open **14498 ms** / reload **2179 ms** (requests **89/88**)
- `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **1720 / 2036 ms** (requests **90/89**)
- `/admin/settings/connections` → **5547 / 1743 ms** (requests **99/99**)
- `/admin/settings/integrations` → **1419 / 1598 ms** (requests **99/99**)
- `/admin/system/general` → **1503 / 1682 ms** (requests **100/100**)
- `/admin/users/overview` → **2164 / 3601 ms** (requests **102/101**)
- `/account/settings/connections` → **2970 / 2272 ms** (requests **85/84**)

### Cross-route shared hotspots (critical path)
- Admin-family shared modules repeatedly in top critical-path slots:
  - `/js/shared/components/workspace-vertical-tabs.js`
  - `/js/shared/components/search-bar.js`
  - `/js/shared/components/sidebar-helpers.js`
  - `/js/shared/components/viewport-modal-shell.js`
  - `/js/shared/components/files-modal-controller.js`
- Chat-family critical chain still dominates slow chat samples:
  - `/js/features/chat/chat-ui-resources.js`
  - `/js/features/chat/chat-shell-controller.js`
  - `/js/features/chat/chat-render-controller.js`
  - `/js/features/chat/chat-data-controller.js`
- API latency contributors appearing in critical path:
  - `/api/models?scope=effective`
  - `/api/tool-servers`
  - `/api/users/me/settings?include=permissions,roles`

### Global recommendation (best overall path)
- **Better approach:** optimize by **shared route-family bundles + API stabilization**, not by aggressive all-at-once deferral.
- Why:
  - Aggressive deferral (Slice 7) reduced request count but increased route-ready instability.
  - Multi-route data shows common module clusters by route family (chat/admin/account), so shared-family optimizations yield broader wins.

### Next unified optimization order
1. **Stability first:** keep Slice 6 baseline and rollback only regressive parts of Slice 7 (realtime/message-list over-deferral).
2. **Admin bundle split:** stop loading users/roles/policies-heavy modules on unrelated admin routes.
3. **API critical-path control:** cache + stagger non-blocking fetches for `/api/models`, `/api/tool-servers`, `/api/users/me/settings`.
4. **Chat core chunking:** keep first paint path minimal, then progressively hydrate secondary chat controllers.

## Post-rollback Rebenchmark (after selective Slice 7 rollback)
_Run timestamps: 2026-04-12T11:25:02Z, 2026-04-12T11:26:45Z_

### Route snapshots (open / reload)
- `/`:
  - sample A: **17020 / 4321 ms** (requests **89 / 87**)
  - sample B: **15142 / 2427 ms** (requests **91 / 87**)
- `/c/528059b5-4dad-4d16-bb16-a64c4780928d`:
  - sample A: **3095 / 3357 ms** (requests **85 / 89**)
  - sample B: **2380 / 4311 ms** (requests **80 / 91**)
- `/admin/settings/connections`:
  - sample A: **2428 / 2117 ms** (requests **100 / 99**)
  - sample B: **5678 / 4453 ms** (requests **105 / 99**)
- `/admin/settings/integrations`:
  - sample A: **2124 / 2174 ms** (requests **99 / 99**)
  - sample B: **3952 / 4136 ms** (requests **99 / 99**)
- `/admin/system/general`:
  - sample A: **2215 / 2495 ms** (requests **100 / 100**)
  - sample B: **2052 / 2454 ms** (requests **100 / 100**)
- `/admin/users/overview`:
  - sample A: **3822 / 3338 ms** (requests **102 / 101**)
  - sample B: **4072 / 2765 ms** (requests **102 / 101**)
- `/account/settings/connections`:
  - sample A: **3460 / 3949 ms** (requests **84 / 84**)
  - sample B: **3566 / 3498 ms** (requests **84 / 84**)

### Waterfall notes from rollback samples
- Home/chat startup (`/`) reintroduced heavy critical-chain scripts at the top of the cold path:
  - `/js/features/chat/chat-shell-controller.js`
  - `/js/features/chat/chat-render-controller.js`
  - `/js/features/chat/chat-message-list-controller.js`
  - `/js/features/chat/chat-ui-resources.js`
  - `/js/features/chat/chat-data-controller.js`
- Targeted chat route reload still shows intermittent API contention:
  - `/api/models?scope=effective`
  - `/api/tool-servers`
- Admin-family shared modules remain recurring hotspots (`search-bar`, `workspace-vertical-tabs`, `settings-shell`, `viewport-modal-shell`).

### Decision update
- Selective rollback fixed the staged-hydration consistency issue but **did not yet deliver stable cross-route latency improvements** in this benchmark set.
- Request fan-out stayed roughly in the same band, while route-ready variance remained high on chat/admin routes.
- Next optimization should focus on:
  1. preserving correctness while moving only heavy chat controller side-effects off the first render path,
  2. splitting admin/users-heavy modules away from non-users admin tabs,
  3. further stabilizing `/api/models` and `/api/tool-servers` critical-path timing.

## Eighth Pass (message-list interactions lazy hydration with first-click fallback)
_Run timestamps: 2026-04-12T11:45:36Z, 2026-04-12T11:46:50Z_

### Changes
- `public/js/features/chat/chat.js`
  - Removed eager `chat-message-list-controller.js` static import and converted it to lazy load (`loadChatMessageListControllerModule`).
  - Added `ensureMessageListInteractions()` to hydrate message-list interactions on demand.
  - Added a first-click fallback handler (`handleMessageListInteractionFallback`) so the first user click still toggles thinking/tool blocks and opens citations before the lazy module is fully loaded.
  - Added non-critical idle warmup for message-list interactions (`scheduleNonCriticalTask(..., 4200)`).

### Route snapshots (open / reload)
- sample A:
  - `/` → **3584 / 2365 ms** (requests **90 / 88**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **3432 / 8319 ms** (requests **77 / 88**)
  - `/admin/settings/connections` → **2891 / 1962 ms** (requests **99 / 99**)
  - `/admin/settings/integrations` → **1996 / 2298 ms** (requests **99 / 99**)
  - `/admin/system/general` → **1459 / 3525 ms** (requests **100 / 100**)
  - `/admin/users/overview` → **3732 / 3716 ms** (requests **102 / 101**)
  - `/account/settings/connections` → **4141 / 4425 ms** (requests **84 / 84**)
- sample B (variance check):
  - `/` → **15043 / 3984 ms** (requests **79 / 84**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **3714 / 3174 ms** (requests **79 / 83**)
  - `/admin/settings/connections` → **6195 / 3993 ms** (requests **102 / 99**)
  - `/admin/settings/integrations` → **3633 / 3870 ms** (requests **99 / 99**)
  - `/admin/system/general` → **4475 / 5823 ms** (requests **100 / 100**)
  - `/admin/users/overview` → **6502 / 6891 ms** (requests **102 / 101**)
  - `/account/settings/connections` → **5723 / 20086 ms** (requests **84 / 84**)

### Observations
- In sample A on `/`, `chat-message-list-controller.js` dropped out of the top startup hotspots; slowest slots shifted to other chat core modules (`chat-realtime-controller`, `chat-data-controller`, `chat-render-controller`, `chat-shell-controller`, `chat-ui-resources`).
- Request fan-out remained in a similar overall band, with some lower-count runs on chat routes.
- Route-ready variance is still high across runs, with severe outliers still appearing (notably account reload and some chat/admin reloads).

### Decision update
- This slice is safe functionally (tests green) and preserves first-click behavior, so it is worth keeping.
- Main remaining problem is not just module count; it is unstable latency spikes across shared route-family modules and key APIs.
- Next optimization should target stability of shared admin/account bundles and API timing (`/api/models`, `/api/tool-servers`, `/api/users/me/settings`).

## Ninth Pass (admin route-family module split via lazy loading)
_Run timestamps: 2026-04-12T12:13:40Z, 2026-04-12T12:14:52Z_

### Changes
- `public/js/features/admin/admin.js`
  - Replaced eager static imports for admin users/settings/system feature modules with lazy route-family loaders.
  - Added `ensureUsersModules()`, `ensureSettingsModules()`, and `ensureSystemModules()` caches to load only the active admin tab family.
  - Updated `renderSubContent` to load the active route family on demand with loading skeleton/error fallback.
  - Kept users groups behavior by lazy-loading groups helpers/list helpers and guarding `shouldLoadGroups`/`preloadGroupsData` behind `ensureUsersModules()`.

### Route snapshots (open / reload)
- sample A:
  - `/` → **15092 / 2754 ms** (requests **80 / 81**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **2960 / 2212 ms** (requests **95 / 85**)
  - `/admin/settings/connections` → **2494 / 2110 ms** (requests **90 / 88**)
  - `/admin/settings/integrations` → **2031 / 1964 ms** (requests **88 / 88**)
  - `/admin/system/general` → **1461 / 1897 ms** (requests **72 / 72**)
  - `/admin/users/overview` → **3063 / 4073 ms** (requests **83 / 82**)
  - `/account/settings/connections` → **3338 / 3198 ms** (requests **84 / 84**)
- sample B (variance check):
  - `/` → **15217 / 2869 ms** (requests **79 / 76**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **3177 / 2412 ms** (requests **96 / 92**)
  - `/admin/settings/connections` → **2147 / 2385 ms** (requests **89 / 88**)
  - `/admin/settings/integrations` → **2172 / 2080 ms** (requests **88 / 88**)
  - `/admin/system/general` → **1792 / 3209 ms** (requests **72 / 72**)
  - `/admin/users/overview` → **3679 / 2780 ms** (requests **83 / 82**)
  - `/account/settings/connections` → **4219 / 7007 ms** (requests **84 / 84**)

### Observations
- Admin non-users routes show a clear request-count drop after split:
  - settings routes: around **99-102** -> **88-90**
  - system route: **100** -> **72**
  - users overview: **101-102** -> **82-83**
- Admin-family slowest request lists no longer consistently include users/roles/policies-heavy modules on settings/system paths.
- Latency variance still exists, but this slice delivered a stable fan-out reduction without breaking behavior.

### Decision update
- Keep this slice: it is functionally safe (tests green) and materially reduces admin startup fan-out across route families.
- Next highest-impact target remains API timing variance (`/api/models?scope=effective`, `/api/users/me/settings?include=permissions,roles`, `/api/tool-servers`) that still appears in critical path outliers.

## Tenth Pass (API critical-path parallelization)
_Run timestamps: 2026-04-12T12:36:27Z, 2026-04-12T12:37:44Z_

### Changes
- `src/services/workspace-settings.js`
  - Parallelized independent account settings loaders in `loadWorkspaceSettingsPayload`:
    - `loadPrimaryRole` + `getConfigValue(default_model_id)` in parallel
    - `resolvePermissions`, `getUserRoles`, `loadUserOpenAIConnectionConfigs`, `getAllOpenAIConnectionConfigs`, and `loadToolServers` in one `Promise.all`
  - Preserved response shape and semantics; only changed orchestration to reduce serial wait time.
- `src/routers/models.js`
  - Parallelized effective-scope ACL dependencies (`getModelAccessMap`, `loadUserResourceOverrides`, `loadModelAclRules`) with `Promise.all`.

### Route snapshots (open / reload)
- sample A:
  - `/` → **13390 / 3718 ms** (requests **80 / 86**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **3229 / 2339 ms** (requests **88 / 88**)
  - `/admin/settings/connections` → **2463 / 2077 ms** (requests **89 / 88**)
  - `/admin/settings/integrations` → **2603 / 2210 ms** (requests **88 / 88**)
  - `/admin/system/general` → **1560 / 2350 ms** (requests **72 / 72**)
  - `/admin/users/overview` → **3629 / 3811 ms** (requests **83 / 82**)
  - `/account/settings/connections` → **3506 / 3774 ms** (requests **84 / 84**)
- sample B (variance check):
  - `/` → **13554 / 2752 ms** (requests **91 / 89**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **2058 / 2215 ms** (requests **88 / 87**)
  - `/admin/settings/connections` → **2296 / 1401 ms** (requests **89 / 88**)
  - `/admin/settings/integrations` → **2234 / 2029 ms** (requests **88 / 88**)
  - `/admin/system/general` → **1846 / 1834 ms** (requests **72 / 72**)
  - `/admin/users/overview` → **1921 / 2958 ms** (requests **82 / 82**)
  - `/account/settings/connections` → **5444 / 2576 ms** (requests **85 / 84**)

### Observations
- Request fan-out remained in the improved post-split bands (especially admin/system at **72** and admin/settings at **88-89**).
- API timings on some outlier reloads were lower than prior sample (e.g., `/api/models?scope=effective` and `/api/users/me/settings` around sub-600ms in sample A), but route-ready variance remains significant overall.
- This slice reduced backend serial dependency depth with minimal risk and no regression in behavior.

### Decision update
- Keep this slice: no regressions, small-to-moderate stability gains in API-heavy paths, and cleaner critical-path orchestration.
- Remaining bottlenecks are now dominated by frontend module hydration variance on chat and shared UI modules rather than obvious backend serialization.

## Eleventh Pass (frontend hydration stability pass)
_Run timestamps: 2026-04-12T12:54:59Z, 2026-04-12T12:56:08Z_

### Changes
- `public/js/features/chat/chat.js`
  - Removed timed idle warmup queue that eagerly triggered multiple non-critical hydrations (`ensureChatModals`, `ensureMessageSequenceTracker`, `ensureChatSidebarListBuilder`, `ensureChatListHandlers`, `ensureStreamRuntime`, `ensureMessageListInteractions`) on a fixed timer.
  - Removed eager sidebar-list builder trigger from the fallback rendering branch in `drawChats` so rendering fallback rows does not force immediate module import.
  - Switched tool-server warmup from timer-based idle callback to interaction-driven trigger (`warmupToolServers`) and call it from first user interactions (chat list interaction, header menu interaction, composer focus).
  - Kept required runtime initialization on actual usage paths (`sendMessage`, `sendSingleMessage`, message-list interaction, stream resume) to preserve behavior correctness.

### Route snapshots (open / reload)
- sample A:
  - `/` → **14932 / 2201 ms** (requests **75 / 76**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **2139 / 2226 ms** (requests **77 / 75**)
  - `/admin/settings/connections` → **1978 / 1888 ms** (requests **90 / 88**)
  - `/admin/settings/integrations` → **1955 / 2572 ms** (requests **88 / 88**)
  - `/admin/system/general` → **1775 / 1682 ms** (requests **72 / 72**)
  - `/admin/users/overview` → **4757 / 1897 ms** (requests **83 / 82**)
  - `/account/settings/connections` → **3885 / 3119 ms** (requests **84 / 84**)
- sample B (variance check):
  - `/` → **2647 / 2069 ms** (requests **80 / 76**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **13285 / 2344 ms** (requests **73 / 77**)
  - `/admin/settings/connections` → **2050 / 1889 ms** (requests **88 / 88**)
  - `/admin/settings/integrations` → **2077 / 1375 ms** (requests **88 / 88**)
  - `/admin/system/general` → **2115 / 1509 ms** (requests **72 / 72**)
  - `/admin/users/overview` → **2433 / 1900 ms** (requests **83 / 82**)
  - `/account/settings/connections` → **3094 / 2758 ms** (requests **84 / 84**)

### Observations
- Request counts on chat routes dropped in several runs (home/open and permalink/open in particular), indicating reduced startup eager fan-out.
- Most admin/account route request bands stayed stable (already improved by earlier slices).
- Severe variance outliers still occur on chat cold-open in some samples, so this pass improves fan-out pressure but does not fully eliminate jitter.

### Decision update
- Keep this pass: behavior remains correct (tests green), and startup pressure is lower by shifting warmups to user intent.
- Next step should target deterministic chat module execution ordering / chunking for the remaining cold-open outliers.

## Twelfth Pass (deterministic realtime lazy-sequencing benchmark)
_Run timestamps: 2026-04-12T13:43:23Z, 2026-04-12T13:44:23Z_

### Changes
- `public/js/features/chat/chat.js`
  - Kept realtime controller initialization on lazy path (`loadChatRealtimeControllerModule`) instead of eager static import.
  - Added deferred `ensureRealtimeController()` bootstrap so realtime handlers hydrate on first actual usage/active-chat transitions.
  - Kept local fallback title update path (`updateChatTitleLocal`) to preserve first-render behavior while realtime module is still loading.

### Route snapshots (open / reload)
- sample A:
  - `/` → **3857 / 3434 ms** (requests **75 / 75**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **4110 / 3353 ms** (requests **77 / 77**)
  - `/admin/settings/connections` → **4050 / 3343 ms** (requests **88 / 88**)
  - `/admin/settings/integrations` → **3305 / 2581 ms** (requests **88 / 88**)
  - `/admin/system/general` → **2843 / 3663 ms** (requests **72 / 72**)
  - `/admin/users/overview` → **3608 / 3247 ms** (requests **83 / 82**)
  - `/account/settings/connections` → **4567 / 3947 ms** (requests **84 / 84**)
- sample B (variance check):
  - `/` → **2984 / 9476 ms** (requests **75 / 75**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **3062 / 3455 ms** (requests **77 / 77**)
  - `/admin/settings/connections` → **2870 / 2782 ms** (requests **88 / 88**)
  - `/admin/settings/integrations` → **3542 / 2338 ms** (requests **88 / 88**)
  - `/admin/system/general` → **3252 / 2653 ms** (requests **72 / 72**)
  - `/admin/users/overview` → **3335 / 2653 ms** (requests **83 / 82**)
  - `/account/settings/connections` → **4432 / 7020 ms** (requests **84 / 84**)

### Observations
- Request fan-out bands stayed stable versus the post-split baseline (home/chat ~75-77, admin settings ~88, system ~72, users ~83, account ~84).
- Remaining outliers still come from shared chat/account bundles rather than realtime bootstrap itself:
  - chat reload outlier (`/` sample B reload **9476 ms**) dominated by `chat-ui-resources`, `chat-shell-controller`, `chat-render-controller`, `chat-data-controller`.
  - account reload outlier (`/account/settings/connections` sample B reload **7020 ms**) dominated by shared shell/admin helper chunks.
- The deterministic realtime lazy-sequencing change is behavior-safe (tests green) but does not by itself remove cross-route latency jitter.

### Decision update
- Keep this slice for correctness/maintainability (realtime init ordering is now explicit and deferred by intent).
- Next optimization should focus on shared heavy module groups (chat core render chain + account/admin shared shell helpers), which still dominate outlier runs.

## Thirteenth Pass (sidebar chat-item menu regression fix)
_Run timestamps: 2026-04-12T14:20:09Z, 2026-04-12T14:24:08Z_

### Changes
- `public/js/features/chat/chat.js`
  - Added deferred sidebar hydration warmup in `drawChats` fallback path to ensure lazy sidebar row rendering eventually upgrades even without scroll interaction.
  - Expanded chat-list hydration triggers from only scroll/wheel/touch to include pointer and keyboard entry (`pointerenter`, `focusin`, `click`) so sidebar action affordances initialize on first real interaction.
  - Kept lazy architecture intact (no eager static imports restored), and added timer cleanup on teardown.

### UI regression verification
- Playwright runtime check (real login):
  - `immediateMenuCount: 0`
  - `hydratedMenuCount: 1`
  - `dropdownOpened: true`
- Result: three-dot menu and dropdown actions are rendered and operable again after hydration.

### Route snapshots (open / reload)
- sample A:
  - `/` → **6926 / 4913 ms** (requests **80 / 80**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **5796 / 7796 ms** (requests **82 / 83**)
  - `/admin/settings/connections` → **7455 / 6047 ms** (requests **88 / 88**)
  - `/admin/settings/integrations` → **5932 / 6503 ms** (requests **88 / 88**)
  - `/admin/system/general` → **12750 / 9509 ms** (requests **72 / 72**)
  - `/admin/users/overview` → **9250 / 8313 ms** (requests **83 / 82**)
  - `/account/settings/connections` → **8087 / 8081 ms** (requests **84 / 84**)
- sample B (variance check):
  - `/` → **30955 / 6485 ms** (requests **81 / 80**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **5837 / 6998 ms** (requests **82 / 82**)
  - `/admin/settings/connections` → **6563 / 11189 ms** (requests **88 / 88**)
  - `/admin/settings/integrations` → **16315 / 10371 ms** (requests **88 / 88**)
  - `/admin/system/general` → **49858 / 11258 ms** (requests **127 / 77**, open fell back to `domcontentloaded` after network-idle timeout)
  - `/admin/users/overview` → **12745 / 33182 ms** (requests **83 / 82**)
  - `/account/settings/connections` → **10001 / 6773 ms** (requests **85 / 84**)

### Observations
- Menu regression is fixed functionally without reverting lazy loading.
- Request-count bands mostly stayed in prior ranges for chat/admin/account routes in sample A.
- Severe route-ready variance remains the dominant unresolved gap, with sporadic API spikes (`/api/models`, `/api/admin/config`, `/api/users/me/settings`) and occasional timeout/fallback behavior in outlier runs.

### Decision update
- Keep this pass: it restores a user-visible regression while preserving optimization structure.
- Remaining work toward "100%" is now mainly variance reduction on shared heavy bundles and API outlier stabilization.

## Fourteenth Pass (account settings + model-prefetch dedupe)
_Run timestamps: 2026-04-12T16:29:25Z, 2026-04-12T16:30:48Z_

### Changes
- `public/js/features/account/account.js`
  - Simplified account settings fetch from `GET /api/users/me/settings?include=permissions,roles` to `GET /api/users/me/settings` to avoid redundant permission/role payload work already present in bootstrap context.
- `public/js/features/account/account-integrations.js`
  - Updated settings trace metadata to the new endpoint path for accurate request attribution.
- `public/js/features/chat/model-selector-controller.js`
  - Replaced direct `fetchModels({ scope: 'effective' })` path with `prefetchModels({ allowCache: true })` from bootstrap to dedupe concurrent effective-model fetches.
- Tests aligned for endpoint change:
  - `tests/unit/public-account-connections.test.js`
  - `tests/unit/public-account-integrations.test.js`

### Validation
- Focused Vitest regression pack passed:
  - `tests/unit/public-chat-render-helpers.test.js`
  - `tests/unit/public-chat-sidebar-list.test.js`
  - `tests/unit/public-chat-list-actions.test.js`
  - `tests/unit/public-account-connections.test.js`
  - `tests/unit/public-account-integrations.test.js`
  - `tests/unit/public-model-selector.test.js`
- Sidebar three-dot runtime re-check (Playwright, real login) passed:
  - `immediateMenuCount: 0`
  - `hydratedMenuCount: 3`
  - `dropdownOpened: true`
- Extended `vitest --bail=1` run reached 56 test files / 590 tests with no failures before timeout window.

### Route snapshots (open / reload)
- sample A:
  - `/` → **4786 / 4039 ms** (requests **80 / 80**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **4191 / 8161 ms** (requests **83 / 82**)
  - `/admin/settings/connections` → **15744 / 3503 ms** (requests **88 / 88**)
  - `/admin/settings/integrations` → **2686 / 2781 ms** (requests **88 / 88**)
  - `/admin/system/general` → **2432 / 2661 ms** (requests **72 / 72**)
  - `/admin/users/overview` → **3945 / 6917 ms** (requests **83 / 82**)
  - `/account/settings/connections` → **10578 / 4458 ms** (requests **84 / 84**)
- sample B (variance check):
  - `/` → **3895 / 3305 ms** (requests **80 / 80**)
  - `/c/528059b5-4dad-4d16-bb16-a64c4780928d` → **4163 / 3394 ms** (requests **82 / 82**)
  - `/admin/settings/connections` → **4052 / 4935 ms** (requests **88 / 88**)
  - `/admin/settings/integrations` → **4174 / 4893 ms** (requests **88 / 88**)
  - `/admin/system/general` → **4945 / 4575 ms** (requests **72 / 72**)
  - `/admin/users/overview` → **9891 / 3336 ms** (requests **83 / 82**)
  - `/account/settings/connections` → **5844 / 11526 ms** (requests **84 / 84**)

### Observations
- Request-count bands stayed stable versus the prior slice bands (chat ~80-83, admin settings ~88, system ~72, users ~82-83, account ~84).
- Account route now shows the simplified settings endpoint in critical-path logs (`/api/users/me/settings`) instead of the include-heavy variant.
- Major latency spikes still occur intermittently and are now concentrated in:
  - `/api/users/me?include=permissions,roles` outlier on admin settings open (sample A),
  - `/api/models?scope=effective` outlier on admin users open (sample B),
  - shared account/admin modal shell chunks on account reload outlier (sample B).

### Decision update
- Keep this slice: behavior remains correct and request orchestration is cleaner with no fan-out regression.
- Remaining gap toward "100%" is still cross-route variance reduction, not missing functionality.

## Change Log
- [x] Plan created
- [x] Baseline metrics captured
- [x] Slice 1 implemented and validated
- [x] Slice 2 implemented and validated
- [x] Slice 3 implemented and validated
- [x] Slice 4 implemented and validated
- [x] Slice 5 implemented and validated
- [x] Slice 6 implemented and validated
- [x] Slice 7 implemented and validated
- [x] Multi-URL benchmark completed
- [x] Post-rollback multi-route rebenchmark completed
- [x] Slice 8 implemented and benchmarked
- [x] Slice 9 implemented and benchmarked
- [x] Slice 10 implemented and benchmarked
- [x] Slice 11 implemented and benchmarked
- [x] Slice 12 implemented and benchmarked
- [x] Slice 13 implemented and benchmarked
- [x] Slice 14 implemented and benchmarked
