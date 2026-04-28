# Chat Interface Components

## Used In
- `public/index.html` (Main App)
- `/s/:id` (Shared Public Chat View)

## Component Variants

### 1. `chat-composer`
- **Purpose**: The primary input mechanism for prompts.
- **Visuals**: `{rounded.pill}` shape, zero elevation, fixed to bottom.
- **Triggers**:
  - `Enter` (Submit)
  - `Shift+Enter` (Newline)
  - Click Send icon.

### 2. `suggestion-chip`
- **Purpose**: Quick-start prompts for new users.
- **Visuals**: Flat, 1px `{colors.hairline}` border, `{colors.canvas-parchment}` background. No shadow.
- **Triggers**:
  - `click` -> auto-fills `chat-composer` AND immediately triggers `api_chat_stream`.

### 3. `message-bubble`
- **Purpose**: Renders user and assistant markdown.
- **Variants**:
  - `user`: Aligned right, light gray or primary tinted background.
  - `assistant`: Aligned left, transparent background.
  - `assistant_streaming`: Displaying a blinking cursor caret at the end of the text node.
  - `assistant_error`: Red border or tint, accompanied by a "Retry" action icon.
