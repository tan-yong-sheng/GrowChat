# Phase 1 — Parallel Discovery (Agent 2): public-*.test.js Audit

## File: tests/unit/public-account-connections.test.js
### Business Behavior Verified: account connections section / disables connection actions when capability denies management / shows hidden shared connections explicitly so they can be restored / keeps shared visibility toggles available when connection management is disabled / sorts enabled personal connections before disabled ones and keeps visible shared rows above hidden ones
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=464 | Tests=8 | Assertions=65 | Avg/assertions_per_test=8.1 | Mocks=3 | Spies=1
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/account/account-connections.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-account-integrations.test.js
### Business Behavior Verified: account integrations section / opens the add integration modal with the shared admin-style shell / clears the account integration modal hash when closed / omits disabled shared integrations from account scope / sorts enabled personal integrations before disabled ones and keeps visible shared servers above hidden ones
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=1048 | Tests=10 | Assertions=83 | Avg/assertions_per_test=8.3 | Mocks=3 | Spies=1
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/account/account-integrations.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-account-models.test.js
### Business Behavior Verified: account models section / renders an admin-style model table without the ACL lock button / renders hidden rows inline without a hidden-for-you badge so they can be restored later / keeps shared model toggles available when model management is disabled / omits admin-disabled models from the account table
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=624 | Tests=8 | Assertions=66 | Avg/assertions_per_test=8.3 | Mocks=2 | Spies=0
### Flags: FRAGILE FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/account/account-models.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-account-shell.test.js
### Business Behavior Verified: account shell tabs / renders the Settings tab on the account route / keeps Settings active on a settings subsection route / renders the shared workspace sidebar chrome
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=158 | Tests=3 | Assertions=25 | Avg/assertions_per_test=8.3 | Mocks=2 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/account/account.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-admin-access.test.js
### Business Behavior Verified: admin access facade / builds connection, tool server, and user access requests with shared paths
### Test Pattern: Unit (Vitest)
### Metrics: Lines=58 | Tests=1 | Assertions=8 | Avg/assertions_per_test=8.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/admin-access.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-admin-acl-family.test.js
### Business Behavior Verified: admin acl family paths / maps family keys to the expected base paths / builds resource and bulk access endpoints consistently / builds the user access endpoint consistently
### Test Pattern: Unit (Vitest)
### Metrics: Lines=25 | Tests=3 | Assertions=11 | Avg/assertions_per_test=3.7 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/admin-acl.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-admin-acl-modal.test.js
### Business Behavior Verified: admin acl modal shell / renders the shared acl modal chrome with stable ids
### Test Pattern: Unit (Vitest)
### Metrics: Lines=38 | Tests=1 | Assertions=16 | Avg/assertions_per_test=16.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/admin/acl-modal.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-admin-connections-helpers.test.js
### Business Behavior Verified: admin connection helpers / normalizes provider labels and types / normalizes records and manual model lists / creates stable connection model ids / previews models without losing prior selection intent
### Test Pattern: Unit (Vitest)
### Metrics: Lines=182 | Tests=9 | Assertions=23 | Avg/assertions_per_test=2.6 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/admin/settings/connections-helpers.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-admin-connections-modal.test.js
### Business Behavior Verified: admin connections modal / creates a connection from the modal and saves it into state / verifies a new connection without payload TDZ errors / labels the modal as edit when opening an existing connection / does not render a master provider toggle and keeps providers visible
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=515 | Tests=10 | Assertions=53 | Avg/assertions_per_test=5.3 | Mocks=3 | Spies=0
### Flags: FRAGILE FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/admin/settings/connections.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-admin-general-helpers.test.js
### Business Behavior Verified: admin general helpers / creates the default settings state / derives toggle state from public registration value
### Test Pattern: Unit (Vitest)
### Metrics: Lines=32 | Tests=2 | Assertions=6 | Avg/assertions_per_test=3.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/admin/settings/general-helpers.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-admin-general.test.js
### Business Behavior Verified: admin general settings / makes immediate API calls when a general setting changes / saves registration status changes immediately to the admin config API
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=106 | Tests=2 | Assertions=9 | Avg/assertions_per_test=4.5 | Mocks=2 | Spies=0
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/admin/settings/general.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-admin-integrations-helpers.test.js
### Business Behavior Verified: admin integrations helpers / builds stable snapshots from tool servers / sanitizes tool servers before save / maps saved servers and toggles auth field visibility / normalizes tool lists with enabled flags
### Test Pattern: Unit (Vitest)
### Metrics: Lines=76 | Tests=4 | Assertions=9 | Avg/assertions_per_test=2.3 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/admin/settings/integrations-helpers.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-admin-integrations.test.js
### Business Behavior Verified: admin integrations settings / locks tool toggles when the server is off and restores their state when re-enabled / saves a new server immediately when modal is saved / labels the modal as add for a new server and edit for an existing one / broadcasts a tool-server invalidation after toggling server enable
### Test Pattern: Unit (Vitest), heavy mocks
### Metrics: Lines=485 | Tests=10 | Assertions=94 | Avg/assertions_per_test=9.4 | Mocks=4 | Spies=0
### Flags: FRAGILE WEAK_MOCK FRAGILE
### Mutation Score: LOW — Valid intent but too many mocks
### Classification: REFACTOR
### Source File: features/admin/settings/integrations.js (exists)
### Recommendation: Reduce mocks from 4 to ≤2; test through integration or spy narrowly.

## File: tests/unit/public-admin-modal-save-helpers.test.js
### Business Behavior Verified: admin modal save helpers / toggles the shared save button state / supports compact custom button styles
### Test Pattern: Unit (Vitest)
### Metrics: Lines=34 | Tests=2 | Assertions=9 | Avg/assertions_per_test=4.5 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/admin/modal-save-helpers.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-admin-modal-shell.test.js
### Business Behavior Verified: Z_INDEX_CLASSES static mapping / admin modal shell / maps all known preset z-index values to Tailwind class names / covers every distinct zIndex used in admin modal presets / emits correct z-index class in modal markup for each preset / falls back to z-[N] class with console.error when an unmapped z-index value is used
### Test Pattern: Unit (Vitest)
### Metrics: Lines=141 | Tests=7 | Assertions=38 | Avg/assertions_per_test=5.4 | Mocks=0 | Spies=1
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/admin/modal-shell.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-admin-models-helpers.test.js
### Business Behavior Verified: admin model helpers / extracts attachment caps from models / clones attachment caps without sharing references / reads cap values and tooltips
### Test Pattern: Unit (Vitest)
### Metrics: Lines=41 | Tests=3 | Assertions=8 | Avg/assertions_per_test=2.7 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/admin/settings/models-helpers.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-admin-models.test.js
### Business Behavior Verified: admin models settings / renders only selected models without an enable/disable toggle / filters provider options from the selected set only / keeps ACL editing available for selected models / keeps explicit No Access ACL edits and saves a combined model settings payload
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=582 | Tests=9 | Assertions=60 | Avg/assertions_per_test=6.7 | Mocks=2 | Spies=0
### Flags: FRAGILE FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/admin/settings/models.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-admin-policies.test.js
### Business Behavior Verified: admin policies settings / shows a dependency warning when a model connection is not allowed for the selected group / shows a dependency warning when a model connection has no ACL rules for the selected group / shows a dependency warning inside the model access modal when the selected group lacks the underlying connection / hides the dependency warning inside the model access modal when the model itself is not allowed
### Test Pattern: Unit (Vitest), heavy mocks
### Metrics: Lines=1155 | Tests=20 | Assertions=107 | Avg/assertions_per_test=5.3 | Mocks=4 | Spies=0
### Flags: FRAGILE WEAK_MOCK FRAGILE
### Mutation Score: LOW — Valid intent but too many mocks
### Classification: REFACTOR
### Source File: features/admin/settings/policies.js (exists)
### Recommendation: Reduce mocks from 4 to ≤2; test through integration or spy narrowly.

## File: tests/unit/public-admin-registration.test.js
### Business Behavior Verified: admin registration settings / renders the public registration toggle / saves public registration toggle changes immediately to the admin config API / saves registration status changes immediately to the admin config API
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=103 | Tests=3 | Assertions=8 | Avg/assertions_per_test=2.7 | Mocks=1 | Spies=0
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/admin/settings/registration.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-admin-route-state.test.js
### Business Behavior Verified: admin route state / resolves canonical route state for top-level admin paths / resolves system sub-routes correctly / builds top and sub navigation paths consistently
### Test Pattern: Unit (Vitest)
### Metrics: Lines=68 | Tests=3 | Assertions=14 | Avg/assertions_per_test=4.7 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/admin/admin-route-state.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-admin-users-groups.test.js
### Business Behavior Verified: admin groups overview / renders the groups panel and opens the membership-only modal / does not render old permission bundle controls / adds a row-level manage policies shortcut for groups / guards the group policies drilldown when the modal has dirty state
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=224 | Tests=7 | Assertions=22 | Avg/assertions_per_test=3.1 | Mocks=1 | Spies=0
### Flags: FRAGILE FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/admin/users/groups.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-admin-users-overview.test.js
### Business Behavior Verified: admin users overview / renders rows and filters them with search input / keeps the users table horizontally scrollable / saves user modal changes immediately / shows custom roles in the row badge and role selector
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=510 | Tests=9 | Assertions=41 | Avg/assertions_per_test=4.6 | Mocks=2 | Spies=2
### Flags: FRAGILE FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/admin/users/overview.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-admin-users-roles.test.js
### Business Behavior Verified: admin users roles / loads persisted roles from the server on a fresh render / renders the roles list as the scroll container itself / creates a new role immediately from the modal save / renders a compact create-role modal with inline accessible controls
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=339 | Tests=7 | Assertions=28 | Avg/assertions_per_test=4.0 | Mocks=1 | Spies=0
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/admin/users/roles.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-api-response.test.js
### Business Behavior Verified: parseApiError / prefers backend details.message for connection test errors
### Test Pattern: Unit (Vitest)
### Metrics: Lines=24 | Tests=1 | Assertions=1 | Avg/assertions_per_test=1.0 | Mocks=0 | Spies=0
### Flags: WEAK_ASSERT
### Mutation Score: LOW — Valid intent but weak assertions
### Classification: REFACTOR
### Source File: shared/api/response.js (exists)
### Recommendation: Add 1 more assertions to strengthen observable-behavior coverage.

## File: tests/unit/public-api.test.js
### Business Behavior Verified: public api helpers / stores auth and client session ids deterministically / rejects expired or malformed access tokens locally / reads and writes model and chat caches with ttl semantics / refreshes auth before a request when the access token is stale
### Test Pattern: Unit (Vitest)
### Metrics: Lines=194 | Tests=7 | Assertions=31 | Avg/assertions_per_test=4.4 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/api.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-app-route-utils.test.js
### Business Behavior Verified: app route helpers / parses chat ids from chat routes / identifies temporary chat ids and builds stubs / injects temp chats only when needed and resolves active chat ids / guards realtime startup on local routes
### Test Pattern: Unit (Vitest)
### Metrics: Lines=50 | Tests=4 | Assertions=9 | Avg/assertions_per_test=2.3 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: bootstrap/app-route-utils.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-app-shells.test.js
### Business Behavior Verified: app shells / XSS prevention in shared chat page / renders a shared chat page with default text when data is missing / renders the admin and chat skeletons / escapes <script> tags in chat title / escapes img onerror XSS in chat title
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=92 | Tests=7 | Assertions=14 | Avg/assertions_per_test=2.0 | Mocks=1 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: bootstrap/app-shells.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-app.test.js
### Business Behavior Verified: public app bootstrap / renders a shared chat page without bootstrapping the chat shell / delegates admin routes to the admin renderer / boots the chat shell on the home route / redirects removed user settings resources routes to the chat shell
### Test Pattern: Unit (Vitest), heavy mocks
### Metrics: Lines=545 | Tests=12 | Assertions=30 | Avg/assertions_per_test=2.5 | Mocks=9 | Spies=0
### Flags: FRAGILE WEAK_MOCK
### Mutation Score: LOW — Valid intent but too many mocks
### Classification: REFACTOR
### Source File: bootstrap/app.js (exists)
### Recommendation: Reduce mocks from 9 to ≤2; test through integration or spy narrowly.

## File: tests/unit/public-audit-logs.test.js
### Business Behavior Verified: audit-logs.js / action badge classification / should classify auth actions as blue / should classify delete actions as red / should classify create actions as green / should classify update actions as yellow
### Test Pattern: Unit (Vitest)
### Metrics: Lines=137 | Tests=13 | Assertions=22 | Avg/assertions_per_test=1.7 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: MEDIUM — Reasonable assertions, moderate mocks
### Classification: RETAIN
### Source File: features/admin/audit-logs.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-auth-bootstrap.test.js
### Business Behavior Verified: public auth bootstrap / defaults to register mode on fresh workspace / keeps login mode when workspace is already initialized / shows a pending approval message instead of logging in when registration does not return tokens
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=260 | Tests=3 | Assertions=10 | Avg/assertions_per_test=3.3 | Mocks=1 | Spies=0
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: bootstrap/auth.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-chat-cache-controller.test.js
### Business Behavior Verified: chat cache controller / prunes cached chats and updates state when needed / schedules pruning only once per window
### Test Pattern: Unit (Vitest)
### Metrics: Lines=61 | Tests=2 | Assertions=2 | Avg/assertions_per_test=1.0 | Mocks=0 | Spies=0
### Flags: FRAGILE WEAK_ASSERT
### Mutation Score: LOW — Valid intent but weak assertions
### Classification: REFACTOR
### Source File: features/chat/chat-cache-controller.js (exists)
### Recommendation: Add 2 more assertions to strengthen observable-behavior coverage.

## File: tests/unit/public-chat-edit-textarea.test.js
### Business Behavior Verified: setupEditTextarea / keeps the textarea height stable after the initial sizing pass / caps the height and preserves the caret at the end
### Test Pattern: Unit (Vitest)
### Metrics: Lines=53 | Tests=2 | Assertions=9 | Avg/assertions_per_test=4.5 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/edit-textarea.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-chat-file-events.test.js
### Business Behavior Verified: chat file events / uploads selected files and appends attachments to the current draft / filters attach-file events before updating the draft / does not show the disabled attachments warning for text-only uploads
### Test Pattern: Unit (Vitest)
### Metrics: Lines=111 | Tests=3 | Assertions=4 | Avg/assertions_per_test=1.3 | Mocks=0 | Spies=0
### Flags: FRAGILE WEAK_ASSERT
### Mutation Score: LOW — Valid intent but weak assertions
### Classification: REFACTOR
### Source File: features/chat/chat-file-events.js (exists)
### Recommendation: Add 2 more assertions to strengthen observable-behavior coverage.

## File: tests/unit/public-chat-list-actions.test.js
### Business Behavior Verified: chat list actions / routes temp chats locally and avoids remote actions / hides the sidebar when opening a regular chat on mobile / wires non-destructive row actions to the expected dependencies / uses browser fallbacks for prompt and alert helpers
### Test Pattern: Unit (Vitest)
### Metrics: Lines=420 | Tests=10 | Assertions=41 | Avg/assertions_per_test=4.1 | Mocks=0 | Spies=0
### Flags: IMPL_DETAIL
### Mutation Score: LOW — Valid intent but tests implementation details
### Classification: REFACTOR
### Source File: features/chat/chat-list-actions.js (exists)
### Recommendation: Shift assertions from spy call-counts to actual rendered output or state changes.

## File: tests/unit/public-chat-message-actions.test.js
### Business Behavior Verified: chat message action binder / binds edit actions and opens citations / pins the edited branch leaf after saving a user message / creates and selects a new branch when saving an assistant message as a copy / copies and collapses markdown code blocks
### Test Pattern: Unit (Vitest)
### Metrics: Lines=300 | Tests=6 | Assertions=20 | Avg/assertions_per_test=3.3 | Mocks=0 | Spies=3
### Flags: FRAGILE FRAGILE IMPL_DETAIL
### Mutation Score: LOW — Valid intent but tests implementation details
### Classification: REFACTOR
### Source File: features/chat/chat-message-actions.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-chat-message-blocks.test.js
### Business Behavior Verified: chat message blocks / appends and ensures block state immutably enough for reuse / syncs tool calls and blocks from raw payloads / updates tool call state from payloads
### Test Pattern: Unit (Vitest)
### Metrics: Lines=45 | Tests=3 | Assertions=6 | Avg/assertions_per_test=2.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/chat-message-blocks.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-chat-message-dom.test.js
### Business Behavior Verified: chat message dom helper / updates message html and applies error state
### Test Pattern: Unit (Vitest)
### Metrics: Lines=75 | Tests=1 | Assertions=9 | Avg/assertions_per_test=9.0 | Mocks=0 | Spies=1
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/chat-message-dom.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-chat-message-identity.test.js
### Business Behavior Verified: chat message identity tracker / replaces temp ids across state, DOM, and pending resolvers / matches pending temp messages by content and parent / matches empty assistant placeholders to completed assistant messages by parent
### Test Pattern: Unit (Vitest)
### Metrics: Lines=107 | Tests=3 | Assertions=8 | Avg/assertions_per_test=2.7 | Mocks=0 | Spies=0
### Flags: FRAGILE FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/chat/chat-message-identity.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-chat-message-list-html.test.js
### Business Behavior Verified: chat message list html builder / renders user and assistant message rows with the provided render helpers
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=93 | Tests=1 | Assertions=8 | Avg/assertions_per_test=8.0 | Mocks=1 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/chat-message-list-html.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-chat-message-rendering.test.js
### Business Behavior Verified: chat message rendering helpers / renders assistant content and attachment pills / keeps graphviz preview and code buttons after sanitization / renders thinking and tool call blocks / renders assistant message body from shared block state
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=119 | Tests=4 | Assertions=12 | Avg/assertions_per_test=3.0 | Mocks=1 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/chat-message-rendering.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-chat-message-seq.test.js
### Business Behavior Verified: chat message sequence tracker / loads, updates, and persists sequence numbers monotonically / ignores invalid stored values
### Test Pattern: Unit (Vitest)
### Metrics: Lines=47 | Tests=2 | Assertions=6 | Avg/assertions_per_test=3.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/chat-message-seq.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-chat-message-stream-assistant.test.js
### Business Behavior Verified: chat message stream assistant helper / mirrors assistant text into state, streaming overrides, and the active DOM / does not update the DOM for inactive chats
### Test Pattern: Unit (Vitest)
### Metrics: Lines=80 | Tests=2 | Assertions=6 | Avg/assertions_per_test=3.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/chat-message-stream-assistant.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-chat-message-stream-temp-chat.test.js
### Business Behavior Verified: chat message stream temp chat helpers / prepares an optimistic temp chat and moves draft state into it / promotes temp chat state to the real chat id and rolls back temp chats cleanly
### Test Pattern: Unit (Vitest)
### Metrics: Lines=97 | Tests=2 | Assertions=16 | Avg/assertions_per_test=8.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/chat-message-stream-temp-chat.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-chat-message-stream.test.js
### Business Behavior Verified: chat message stream helper / finishes immediately when asked to send a blank prompt / remaps temp ids when sending the first message / serializes an explicit all-off tool selection as an empty list / preserves an empty tool selection when a temp chat becomes real
### Test Pattern: Unit (Vitest)
### Metrics: Lines=714 | Tests=9 | Assertions=21 | Avg/assertions_per_test=2.3 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/chat-message-stream.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-chat-message-utils.test.js
### Business Behavior Verified: chat message utils / splits thinking segments and builds message blocks / formats model and api error labels / normalizes thinking and tool payloads
### Test Pattern: Unit (Vitest)
### Metrics: Lines=55 | Tests=3 | Assertions=12 | Avg/assertions_per_test=4.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/chat-message-utils.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-chat-modals.test.js
### Business Behavior Verified: chat modals helper / wires share and citation modals / restores archived chats through the archive toggle path
### Test Pattern: Unit (Vitest)
### Metrics: Lines=92 | Tests=2 | Assertions=14 | Avg/assertions_per_test=7.0 | Mocks=0 | Spies=0
### Flags: FRAGILE IMPL_DETAIL
### Mutation Score: LOW — Valid intent but tests implementation details
### Classification: REFACTOR
### Source File: features/chat/chat-modals.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-chat-render-helpers.test.js
### Business Behavior Verified: chat render helpers / builds chat rows and marks the active row / falls back to default labels when models are missing
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=55 | Tests=2 | Assertions=10 | Avg/assertions_per_test=5.0 | Mocks=1 | Spies=0
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/chat/chat-render-helpers.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-chat-sidebar-list.test.js
### Business Behavior Verified: chat sidebar list fragment / renders pinned and grouped chat sections with loading sentinel support
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=76 | Tests=1 | Assertions=5 | Avg/assertions_per_test=5.0 | Mocks=1 | Spies=0
### Flags: IMPL_DETAIL
### Mutation Score: LOW — Valid intent but tests implementation details
### Classification: REFACTOR
### Source File: features/chat/chat-sidebar-list.js (exists)
### Recommendation: Shift assertions from spy call-counts to actual rendered output or state changes.

## File: tests/unit/public-chat-stream-controller.test.js
### Business Behavior Verified: chat stream controller / finds the running assistant message / polls message status and stops when the message is done / tracks resume sessions and cleans them up / disposes outstanding pollers and resume sessions
### Test Pattern: Unit (Vitest)
### Metrics: Lines=73 | Tests=4 | Assertions=8 | Avg/assertions_per_test=2.0 | Mocks=0 | Spies=0
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/chat/chat-stream-controller.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-chat-stream-state.test.js
### Business Behavior Verified: chat stream state helper / updates streaming state and cancels messages locally
### Test Pattern: Unit (Vitest)
### Metrics: Lines=57 | Tests=1 | Assertions=6 | Avg/assertions_per_test=6.0 | Mocks=0 | Spies=0
### Flags: IMPL_DETAIL
### Mutation Score: LOW — Valid intent but tests implementation details
### Classification: REFACTOR
### Source File: features/chat/chat-stream-state.js (exists)
### Recommendation: Shift assertions from spy call-counts to actual rendered output or state changes.

## File: tests/unit/public-chat-stream.test.js
### Business Behavior Verified: chat stream helper / consumes SSE chunks across boundaries and flushes trailing payloads / rejects when body is missing
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=85 | Tests=2 | Assertions=3 | Avg/assertions_per_test=1.5 | Mocks=1 | Spies=0
### Flags: [GOOD]
### Mutation Score: MEDIUM — Reasonable assertions, moderate mocks
### Classification: RETAIN
### Source File: features/chat/chat-stream.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-chat-ui-resources.test.js
### Business Behavior Verified: chat ui resources / memoizes modal loaders and attaches the profile footer on idle / refreshes tool servers on invalidation and caches attachment images
### Test Pattern: Unit (Vitest)
### Metrics: Lines=87 | Tests=2 | Assertions=12 | Avg/assertions_per_test=6.0 | Mocks=0 | Spies=2
### Flags: FRAGILE IMPL_DETAIL
### Mutation Score: LOW — Valid intent but tests implementation details
### Classification: REFACTOR
### Source File: features/chat/chat-ui-resources.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-chat-wire-init.test.js
### Business Behavior Verified: initWireChat / populates ctx with ensureStreamSession so setupWireChatFeatures can destructure it / populates ctx with activeStreamAbort (initially null) / proxies use latest ctx impl assignments (no stale closure) / all proxy functions use late-bound ctx impl (no stale closures)
### Test Pattern: Unit (Vitest)
### Metrics: Lines=167 | Tests=4 | Assertions=8 | Avg/assertions_per_test=2.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/chat-wire-init.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-connection-model-selection.test.js
### Business Behavior Verified: connection model selection mode / normalizes supported selection modes / resolves all, some, and none selection states
### Test Pattern: Unit (Vitest)
### Metrics: Lines=23 | Tests=2 | Assertions=7 | Avg/assertions_per_test=3.5 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/utils/connection-model-selection.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-files-modal-helpers.test.js
### Business Behavior Verified: files modal helpers / derives file status and delete permission / filters files by filename or type / renders file list and empty state markup
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=45 | Tests=3 | Assertions=8 | Avg/assertions_per_test=2.7 | Mocks=1 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/files-modal-helpers.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-files-modal.test.js
### Business Behavior Verified: files modal / opens and emits attached files from the current selection
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=66 | Tests=1 | Assertions=6 | Avg/assertions_per_test=6.0 | Mocks=2 | Spies=0
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: shared/components/files-modal.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-markdown-utils.test.js
### Business Behavior Verified: markdown rendering utilities / uses marked.lexer when available and applies configuration / renders paragraphs, tables, and code blocks from tokens / falls back to paragraph and code fence rendering when marked is missing / decodes HTML entities before rendering assistant text
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=422 | Tests=16 | Assertions=81 | Avg/assertions_per_test=5.1 | Mocks=1 | Spies=0
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: shared/utils.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-message-input-helpers.test.js
### Business Behavior Verified: message input helpers / manipulates pending queue items immutably / builds attachment accept lists from state / renders composer attachment and queue markup
### Test Pattern: Unit (Vitest)
### Metrics: Lines=32 | Tests=3 | Assertions=7 | Avg/assertions_per_test=2.3 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/message-input-helpers.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-message-input.test.js
### Business Behavior Verified: message input / shows the active model name in the placeholder and footer / does not render the disabled attachments warning / disables the composer when no selectable models are available / persists the draft for the active chat while typing
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=338 | Tests=9 | Assertions=42 | Avg/assertions_per_test=4.7 | Mocks=1 | Spies=0
### Flags: FRAGILE FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/chat/message-input.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-mobile-safe-area.test.js
### Business Behavior Verified: mobile safe-area shell / reserves the mobile safe area in the public viewport / uses the dynamic viewport and safe-area footer padding in the chat shell / uses the dynamic viewport and safe-area footer padding in the admin shell
### Test Pattern: Unit (Vitest)
### Metrics: Lines=30 | Tests=3 | Assertions=5 | Avg/assertions_per_test=1.7 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: MEDIUM — Reasonable assertions, moderate mocks
### Classification: RETAIN
### Source File: public/index.html (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-model-access-badge.test.js
### Business Behavior Verified: model-access-badge component / renders escaped label and model access attribute / renders model badge from shared presentation logic / supports account semantics override for shared access
### Test Pattern: Unit (Vitest)
### Metrics: Lines=49 | Tests=3 | Assertions=8 | Avg/assertions_per_test=2.7 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/model-access-badge.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-model-access-presentation.test.js
### Business Behavior Verified: getModelAccessPresentation / returns personal style for personal access / returns shared style by default for shared access / supports account override mapping shared to admin style / falls back to access_label or Admin
### Test Pattern: Unit (Vitest)
### Metrics: Lines=46 | Tests=4 | Assertions=5 | Avg/assertions_per_test=1.3 | Mocks=0 | Spies=0
### Flags: WEAK_ASSERT
### Mutation Score: LOW — Valid intent but weak assertions
### Classification: REFACTOR
### Source File: shared/utils/model-access-presentation.js (exists)
### Recommendation: Add 3 more assertions to strengthen observable-behavior coverage.

## File: tests/unit/public-model-search.test.js
### Business Behavior Verified: model search helpers / normalizes model search queries / filters models by id, name, provider, and connection fields
### Test Pattern: Unit (Vitest)
### Metrics: Lines=25 | Tests=2 | Assertions=6 | Avg/assertions_per_test=3.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/utils/model-search.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-model-selector-helpers.test.js
### Business Behavior Verified: model selector helpers / formats model display labels / derives filtered and visible model slices / falls back to the first alphabetically sorted model when no preferred id matches / renders the selected model option markup
### Test Pattern: Unit (Vitest)
### Metrics: Lines=150 | Tests=8 | Assertions=25 | Avg/assertions_per_test=3.1 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: features/chat/model-selector-helpers.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-model-selector-race.test.js
### Business Behavior Verified: model-selector race condition / ensureModelsLoaded discards stale response after invalidation / ensureModelsLoaded applies fresh response when generation is unchanged / ensureModelsLoaded clears loadingPromise when dynamic import fails
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=206 | Tests=3 | Assertions=6 | Avg/assertions_per_test=2.0 | Mocks=2 | Spies=0
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: shared/store.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-model-selector.test.js
### Business Behavior Verified: model selector / shows the active model name / shows a scope-aware empty state when no selectable models exist / falls back to the first alphabetical model when no active model is set / updates the active model when a model is selected
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=244 | Tests=8 | Assertions=19 | Avg/assertions_per_test=2.4 | Mocks=2 | Spies=0
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: features/chat/model-selector.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-model-state.test.js
### Business Behavior Verified: public model state helpers / counts enabled models from arrays and ignores non-arrays / filters enabled models from arrays and ignores non-arrays / sorts enabled models first and breaks ties consistently / breaks ties on the connection name when labels and ids match
### Test Pattern: Unit (Vitest)
### Metrics: Lines=57 | Tests=5 | Assertions=7 | Avg/assertions_per_test=1.4 | Mocks=0 | Spies=0
### Flags: WEAK_ASSERT
### Mutation Score: LOW — Valid intent but weak assertions
### Classification: REFACTOR
### Source File: shared/utils/model-state.js (exists)
### Recommendation: Add 3 more assertions to strengthen observable-behavior coverage.

## File: tests/unit/public-router.test.js
### Business Behavior Verified: public router / returns health details without auth / returns a sanitized shared chat payload / falls back to index.html for browser navigation
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=132 | Tests=3 | Assertions=16 | Avg/assertions_per_test=5.3 | Mocks=1 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: src/routers/public.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-search-bar.test.js
### Business Behavior Verified: shared render-state helpers / restores scroll position and focused search input after rerender
### Test Pattern: Unit (Vitest)
### Metrics: Lines=62 | Tests=1 | Assertions=4 | Avg/assertions_per_test=4.0 | Mocks=0 | Spies=0
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: shared/components/search-bar.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-search-modal-helpers.test.js
### Business Behavior Verified: search modal helpers / normalizes backend queries / groups chats by date label / avoids january 1970 labels for missing or epoch dates / renders empty and grouped result markup
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=60 | Tests=5 | Assertions=11 | Avg/assertions_per_test=2.2 | Mocks=1 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/search-modal-helpers.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-search-modal.test.js
### Business Behavior Verified: search modal / opens and forwards the new chat action
### Test Pattern: Unit (Vitest), moderate mocks
### Metrics: Lines=54 | Tests=1 | Assertions=5 | Avg/assertions_per_test=5.0 | Mocks=2 | Spies=0
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: shared/components/search-modal.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-settings-drawer-shell.test.js
### Business Behavior Verified: settings drawer shell / keeps a visible outer gutter on all breakpoints
### Test Pattern: Unit (Vitest)
### Metrics: Lines=24 | Tests=1 | Assertions=8 | Avg/assertions_per_test=8.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/settings-drawer-shell.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-settings-modal-shell.test.js
### Business Behavior Verified: settings modal shell / renders the shared admin-style modal shell markup / creates a modal shell and exposes sections
### Test Pattern: Unit (Vitest)
### Metrics: Lines=42 | Tests=2 | Assertions=13 | Avg/assertions_per_test=6.5 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/settings-modal-shell.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-settings-nav.test.js
### Business Behavior Verified: settings nav pane / renders grouped settings navigation with active state
### Test Pattern: Unit (Vitest)
### Metrics: Lines=32 | Tests=1 | Assertions=4 | Avg/assertions_per_test=4.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/settings-nav.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-settings-route-cache.test.js
### Business Behavior Verified: settings route cache / flushes pending invalidations once a refresh handler is registered / consumes same-tab broadcast events for settings refresh channels
### Test Pattern: Unit (Vitest)
### Metrics: Lines=61 | Tests=2 | Assertions=6 | Avg/assertions_per_test=3.0 | Mocks=0 | Spies=0
### Flags: IMPL_DETAIL
### Mutation Score: LOW — Valid intent but tests implementation details
### Classification: REFACTOR
### Source File: shared/utils/settings-route-cache.js (exists)
### Recommendation: Shift assertions from spy call-counts to actual rendered output or state changes.

## File: tests/unit/public-settings-shell.test.js
### Business Behavior Verified: settings shell / renders the shared page frame with custom host ids
### Test Pattern: Unit (Vitest)
### Metrics: Lines=25 | Tests=1 | Assertions=7 | Avg/assertions_per_test=7.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/settings-shell.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-settings-top-nav.test.js
### Business Behavior Verified: settings top nav / renders the shared nav wrapper with the sidebar toggle when enabled / renders the same wrapper without the sidebar toggle when disabled / allows custom leading controls to replace the default toggle
### Test Pattern: Unit (Vitest)
### Metrics: Lines=59 | Tests=3 | Assertions=11 | Avg/assertions_per_test=3.7 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/settings-top-nav.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-settings-viewport.test.js
### Business Behavior Verified: settings viewport / renders the shared outer settings wrapper with configurable classes
### Test Pattern: Unit (Vitest)
### Metrics: Lines=18 | Tests=1 | Assertions=4 | Avg/assertions_per_test=4.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/settings-viewport.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-sidebar-helpers.test.js
### Business Behavior Verified: sidebar helpers / derives hidden, mobile, collapsed, and expanded layouts
### Test Pattern: Unit (Vitest)
### Metrics: Lines=14 | Tests=1 | Assertions=4 | Avg/assertions_per_test=4.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/sidebar-helpers.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-sidebar-visibility.test.js
### Business Behavior Verified: sidebar visibility route scopes / keeps the sidebar stable for admin overview routes / collapses the sidebar for admin settings routes on desktop / hides the sidebar for admin settings routes on mobile
### Test Pattern: Unit (Vitest)
### Metrics: Lines=67 | Tests=3 | Assertions=5 | Avg/assertions_per_test=1.7 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: MEDIUM — Reasonable assertions, moderate mocks
### Classification: RETAIN
### Source File: shared/utils/sidebar-visibility.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-storage.test.js
### Business Behavior Verified: storage helpers / reads and writes JSON values safely / reads and writes string values safely / removes stored values
### Test Pattern: Unit (Vitest)
### Metrics: Lines=37 | Tests=3 | Assertions=8 | Avg/assertions_per_test=2.7 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/utils/storage.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-store.test.js
### Business Behavior Verified: public store / hydrates layout and drafts from local storage / merges nested state updates and persists the expected fields / replaces tool selection maps so deleted keys are actually removed / notifies subscribers immediately and stops after unsubscribe
### Test Pattern: Unit (Vitest)
### Metrics: Lines=112 | Tests=5 | Assertions=29 | Avg/assertions_per_test=5.8 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/store.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-tool-server-sync.test.js
### Business Behavior Verified: tool server sync / broadcasts and consumes invalidations once
### Test Pattern: Unit (Vitest)
### Metrics: Lines=32 | Tests=1 | Assertions=6 | Avg/assertions_per_test=6.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/utils/tool-server-sync.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-user-profile-footer-helpers.test.js
### Business Behavior Verified: user profile footer helpers / derives avatar labels and status colors / computes presence from idle time / renders footer markup
### Test Pattern: Unit (Vitest)
### Metrics: Lines=29 | Tests=3 | Assertions=6 | Avg/assertions_per_test=2.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/user-profile-footer-helpers.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-user-profile-footer.test.js
### Business Behavior Verified: user profile footer / renders user info and emits the archived event / guards admin navigation before leaving a dirty admin page / opens account settings without pushing a route
### Test Pattern: Unit (Vitest)
### Metrics: Lines=95 | Tests=3 | Assertions=9 | Avg/assertions_per_test=3.0 | Mocks=0 | Spies=1
### Flags: FRAGILE
### Mutation Score: MEDIUM — Brittle timers or DOM selectors
### Classification: REFACTOR
### Source File: shared/components/user-profile-footer.js (exists)
### Recommendation: Remove timer dependencies; assert on final DOM/state instead of intermediate timing.

## File: tests/unit/public-viewport-modal-shell.test.js
### Business Behavior Verified: viewport modal shell / renders a top-aligned viewport-safe shell by default
### Test Pattern: Unit (Vitest)
### Metrics: Lines=21 | Tests=1 | Assertions=6 | Avg/assertions_per_test=6.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/viewport-modal-shell.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-workspace-capabilities.test.js
### Business Behavior Verified: normalizeWorkspaceCapabilities / derives account capabilities from account permissions with ACL disabled / derives admin capabilities from admin permissions with ACL enabled / preserves explicit capability overrides
### Test Pattern: Unit (Vitest)
### Metrics: Lines=60 | Tests=3 | Assertions=4 | Avg/assertions_per_test=1.3 | Mocks=0 | Spies=0
### Flags: WEAK_ASSERT
### Mutation Score: LOW — Valid intent but weak assertions
### Classification: REFACTOR
### Source File: shared/utils/workspace-capabilities.js (exists)
### Recommendation: Add 2 more assertions to strengthen observable-behavior coverage.

## File: tests/unit/public-workspace-settings-subnav-config.test.js
### Business Behavior Verified: workspace settings subnav config / builds the account settings item set from the shared definitions / builds the admin settings item set from the shared definitions
### Test Pattern: Unit (Vitest)
### Metrics: Lines=34 | Tests=2 | Assertions=5 | Avg/assertions_per_test=2.5 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/workspace-settings-subnav-config.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-workspace-shell.test.js
### Business Behavior Verified: workspace shell / renders the shared outer frame with sidebar and main slots
### Test Pattern: Unit (Vitest)
### Metrics: Lines=17 | Tests=1 | Assertions=4 | Avg/assertions_per_test=4.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/workspace-shell.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-workspace-sidebar.test.js
### Business Behavior Verified: workspace sidebar / renders the shared global sidebar chrome
### Test Pattern: Unit (Vitest), heavy mocks
### Metrics: Lines=40 | Tests=1 | Assertions=6 | Avg/assertions_per_test=6.0 | Mocks=5 | Spies=0
### Flags: WEAK_MOCK
### Mutation Score: LOW — Valid intent but too many mocks
### Classification: REFACTOR
### Source File: shared/components/workspace-sidebar.js (exists)
### Recommendation: Reduce mocks from 5 to ≤2; test through integration or spy narrowly.

## File: tests/unit/public-workspace-top-nav-config.test.js
### Business Behavior Verified: workspace top nav config / builds the account tab set and active key for the drawer shell / builds the admin tab set and active key from the current main tab
### Test Pattern: Unit (Vitest)
### Metrics: Lines=33 | Tests=2 | Assertions=7 | Avg/assertions_per_test=3.5 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/workspace-top-nav-config.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

## File: tests/unit/public-workspace-top-tabs.test.js
### Business Behavior Verified: workspace top tabs / renders the admin-style tab row for shared shells
### Test Pattern: Unit (Vitest)
### Metrics: Lines=22 | Tests=1 | Assertions=5 | Avg/assertions_per_test=5.0 | Mocks=0 | Spies=0
### Flags: [GOOD]
### Mutation Score: HIGH — Strong assertions, controlled mock surface
### Classification: RETAIN
### Source File: shared/components/workspace-top-tabs.js (exists)
### Recommendation: Keep as-is; monitor for mutation-test coverage gaps on conditional branches.

---SUMMARY---
Files audited: 92
RETAIN: public-account-shell.test.js, public-admin-access.test.js, public-admin-acl-family.test.js, public-admin-acl-modal.test.js, public-admin-connections-helpers.test.js, public-admin-general-helpers.test.js, public-admin-integrations-helpers.test.js, public-admin-modal-save-helpers.test.js, public-admin-modal-shell.test.js, public-admin-models-helpers.test.js, public-admin-route-state.test.js, public-api.test.js, public-app-route-utils.test.js, public-app-shells.test.js, public-audit-logs.test.js, public-chat-edit-textarea.test.js, public-chat-message-blocks.test.js, public-chat-message-dom.test.js, public-chat-message-list-html.test.js, public-chat-message-rendering.test.js, public-chat-message-seq.test.js, public-chat-message-stream-assistant.test.js, public-chat-message-stream-temp-chat.test.js, public-chat-message-stream.test.js, public-chat-message-utils.test.js, public-chat-stream.test.js, public-chat-wire-init.test.js, public-connection-model-selection.test.js, public-files-modal-helpers.test.js, public-message-input-helpers.test.js, public-mobile-safe-area.test.js, public-model-access-badge.test.js, public-model-search.test.js, public-model-selector-helpers.test.js, public-router.test.js, public-search-modal-helpers.test.js, public-settings-drawer-shell.test.js, public-settings-modal-shell.test.js, public-settings-nav.test.js, public-settings-shell.test.js, public-settings-top-nav.test.js, public-settings-viewport.test.js, public-sidebar-helpers.test.js, public-sidebar-visibility.test.js, public-storage.test.js, public-store.test.js, public-tool-server-sync.test.js, public-user-profile-footer-helpers.test.js, public-viewport-modal-shell.test.js, public-workspace-settings-subnav-config.test.js, public-workspace-shell.test.js, public-workspace-top-nav-config.test.js, public-workspace-top-tabs.test.js
REFACTOR: public-account-connections.test.js, public-account-integrations.test.js, public-account-models.test.js, public-admin-connections-modal.test.js, public-admin-general.test.js, public-admin-integrations.test.js, public-admin-models.test.js, public-admin-policies.test.js, public-admin-registration.test.js, public-admin-users-groups.test.js, public-admin-users-overview.test.js, public-admin-users-roles.test.js, public-api-response.test.js, public-app.test.js, public-auth-bootstrap.test.js, public-chat-cache-controller.test.js, public-chat-file-events.test.js, public-chat-list-actions.test.js, public-chat-message-actions.test.js, public-chat-message-identity.test.js, public-chat-modals.test.js, public-chat-render-helpers.test.js, public-chat-sidebar-list.test.js, public-chat-stream-controller.test.js, public-chat-stream-state.test.js, public-chat-ui-resources.test.js, public-files-modal.test.js, public-markdown-utils.test.js, public-message-input.test.js, public-model-access-presentation.test.js, public-model-selector-race.test.js, public-model-selector.test.js, public-model-state.test.js, public-search-bar.test.js, public-search-modal.test.js, public-settings-route-cache.test.js, public-user-profile-footer.test.js, public-workspace-capabilities.test.js, public-workspace-sidebar.test.js
REMOVE: 
Estimated lines removed if REMOVE files deleted: 0
Top blind spots: Timers/flushPromises hide async edge cases; heavy mocking of apiFetch/utils prevents catching wrong-argument mutations; spyOn call-count assertions are blind to logic changes inside spied functions; DOM innerText exact-match tests miss structural mutations.
---END SUMMARY---
