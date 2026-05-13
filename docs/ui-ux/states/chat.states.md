# Main Chat Interface (`/`) UI States

This document maps the explicit state machines for elements within the primary chat interface to assist in finding unhandled exceptions and visual bugs.

## 1. Message Composer (`#message-input` / `#composer`)

**Purpose**: Captures user input and triggers chat completion streams.

### Valid States:
- `Idle_Empty`: Textarea is empty. Submit button is visually disabled or hidden.
- `Typing`: Textarea contains text. Submit button is active (`Action Blue`).
- `Generating`: Submit fired. Textarea clears (or disables). Submit button transforms into a "Stop Generating" square icon.
- `Stream_Paused`: Generation halted manually.
- `Stream_Error`: Network disconnect or API failure during generation.

### State Transitions & Bug Checks:
- `Typing` → `Generating` (On Enter key or click)
  - **Bug check**: Does hitting `Shift+Enter` correctly add a new line *without* triggering submission?
- `Generating` → `Typing` (On Stop Generating clicked)
- `Generating` → `Stream_Error`
  - **Bug check**: If the stream drops, does a distinct "Retry" button appear on the partial message bubble?

## 2. Chat History Sidebar (`#sidebar`)

**Purpose**: Navigation context and session history.

### Valid States:
- `Expanded_Desktop`: Sidebar visible side-by-side with chat.
- `Collapsed_Desktop`: Sidebar hidden, chat takes full width.
- `Hidden_Mobile`: Sidebar hidden off-canvas.
- `Overlay_Mobile`: Sidebar visible on mobile, obscuring chat.

### State Transitions & Bug Checks:
- `Hidden_Mobile` → `Overlay_Mobile` (On hamburger menu click)
- `Overlay_Mobile` → `Hidden_Mobile` (On clicking a chat link or backdrop)
  - **Bug check**: On tablet/mobile, does selecting a historical chat correctly auto-collapse the sidebar so the user can immediately read the content?

## 3. Main Chat View (`#chat-container`)

**Purpose**: Renders the conversation.

### Valid States:
- `Empty_State`: No active chat. Shows "How can I help you today?" and suggestion chips.
- `Loading_History`: User clicked a past chat. Spinner visible.
- `Active_Conversation`: Messages rendered.
- `Error_404`: Attempted to load a deleted or invalid chat ID.

### State Transitions & Bug Checks:
- `Loading_History` → `Error_404`
  - **Bug check**: Does a 404 cleanly redirect back to `Empty_State` with a toast, or does it leave the user on a broken blank screen?
