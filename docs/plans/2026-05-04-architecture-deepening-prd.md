# Architecture Deepening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the architecture of the backend authorization and frontend chat UI to improve locality, leverage, and AI-navigability.

**Architecture:**
1. **Backend Authorization Consolidation:** Consolidate fragmented authorization logic (`auth.js`, `rbac.js`, `role-policy.js`, etc.) into a deep `src/access-control/` module. The new module exposes an explicit domain interface (`hasRole` and `hasAccess`) that aligns with `CONTEXT.md`.
2. **Frontend Chat Deep Renderer:** Replace 30+ shallow UI helper files in `public/js/features/chat/` with a stateful `ChatMessageNode` renderer instance. It manages its own DOM updates for streaming and delegates actions via bubbled Custom DOM Events.

**Tech Stack:** JavaScript (Node.js/Express for backend, Vanilla JS for frontend).

---

## Part 1: Backend Authorization Consolidation

### Context
Currently, authorization logic is fragmented across multiple shallow files (`src/auth.js`, `src/utils/rbac.js`, `src/utils/role-policy.js`, `src/utils/*-acl.js`), lacking locality. Router guards are coupled to these internal utility functions rather than a unified policy interface.

### Target Interface (Explicit Domain Interface)
The new deep module will expose two distinct methods, aligning perfectly with the domain definitions in `CONTEXT.md` for **Role** (coarse access) and **ACL** (resource-scoped rules).

```javascript
// src/access-control/index.js
export async function hasRole(principal, roleName) { ... }
export async function hasAccess(principal, action, resource) { ... }
```

### Task 1: Create the `access-control` module scaffolding

**Files:**
- Create: `src/access-control/index.js`
- Test: `src/access-control/index.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// src/access-control/index.test.js
import { hasRole, hasAccess } from './index.js';

describe('Access Control', () => {
  describe('hasRole', () => {
    it('should throw an error if not implemented', async () => {
      await expect(hasRole({}, 'admin')).rejects.toThrow('Not implemented');
    });
  });

  describe('hasAccess', () => {
    it('should throw an error if not implemented', async () => {
      await expect(hasAccess({}, 'edit', {})).rejects.toThrow('Not implemented');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/access-control/index.test.js`
Expected: FAIL (Cannot find module or Not implemented)

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/access-control/index.js
export async function hasRole(principal, roleName) {
  throw new Error('Not implemented');
}

export async function hasAccess(principal, action, resource) {
  throw new Error('Not implemented');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/access-control/index.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/access-control/index.js src/access-control/index.test.js
git commit -m "feat(auth): scaffold access-control module interface"
```

### Task 2: Migrate Role logic into the deep module

**Files:**
- Modify: `src/access-control/index.js`
- Modify: `src/access-control/index.test.js`
- Delete: `src/utils/user-role.js` (or similar shallow role files)

*(Agent to follow standard red-green-refactor loop to copy implementation from shallow utils into `hasRole`, run tests, and delete old utils).*

### Task 3: Migrate ACL logic into the deep module

**Files:**
- Modify: `src/access-control/index.js`
- Modify: `src/access-control/index.test.js`
- Delete: `src/utils/model-acl.js`, `src/utils/connection-acl.js`, `src/utils/tool-server-acl.js`

*(Agent to follow standard red-green-refactor loop to copy implementation from shallow utils into `hasAccess`, run tests, and delete old utils).*

### Task 4: Update Router Guards

**Files:**
- Modify: `src/utils/admin.js` (or relevant middleware)
- Modify: `src/utils/authorize.js`

*(Agent to replace imports of the old shallow utils with the new `access-control/index.js` interface).*

---

## Part 2: Frontend Chat Deep Renderer

### Context
The chat UI is currently built using 30+ shallow files (e.g., `chat-message-actions.js`, `chat-message-dom.js`). The caller acts as a micro-manager, orchestrating these tiny helpers to render a single message.

### Target Interface (Stateful Renderer Instance with Custom Events)
The new deep module will be a single `ChatMessageNode` class that manages its own DOM updates for streaming. It will delegate actions to the controller via bubbled native `CustomEvent`s.

```javascript
// public/js/features/chat/chat-message-node.js
export class ChatMessageNode {
  constructor(messageData) { ... }
  appendToken(token) { ... }
  render() { return this.el; } 
  // Internally emits 'chat:delete-message', 'chat:retry-message'
}
```

### Task 5: Create the `ChatMessageNode` scaffolding

**Files:**
- Create: `public/js/features/chat/chat-message-node.js`

- [ ] **Step 1: Write the minimal implementation**

```javascript
// public/js/features/chat/chat-message-node.js
export class ChatMessageNode {
  constructor(messageData) {
    this.data = messageData;
    this.el = document.createElement('div');
    this.el.className = 'chat-message';
    this.el.dataset.id = messageData.id;
  }
  
  appendToken(token) {
    // Scaffold
  }
  
  render() {
    this.el.innerHTML = `<p>${this.data.content || ''}</p>`;
    return this.el;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/features/chat/chat-message-node.js
git commit -m "feat(ui): scaffold ChatMessageNode stateful renderer"
```

### Task 6: Consolidate Shallow UI Helpers into `ChatMessageNode`

**Files:**
- Modify: `public/js/features/chat/chat-message-node.js`
- Delete: `public/js/features/chat/chat-message-dom.js`, `public/js/features/chat/chat-message-actions.js`, etc.

*(Agent to manually port the rendering logic from the shallow helper files into the internal methods of `ChatMessageNode`)*

### Task 7: Wire up Custom DOM Events

**Files:**
- Modify: `public/js/features/chat/chat-message-node.js`
- Modify: `public/js/features/chat/chat-render-controller.js` (or similar controller)

*(Agent to update `ChatMessageNode` to emit `new CustomEvent('chat:delete-message', { bubbles: true, detail: { id } })` on button clicks. Agent to update the Controller to listen for these events on the parent container).*
