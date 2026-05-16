# Chat Interface Components

## Used In
<<<<<<< HEAD

=======
>>>>>>> feature/short-term-tasks
- `public/index.html` (Main App)
- `/s/:id` (Shared Public Chat View)

## Component Variants

### 1. `chat-composer`
<<<<<<< HEAD

=======
>>>>>>> feature/short-term-tasks
- **Purpose**: The primary input mechanism for prompts.
- **Visuals**: `{rounded.pill}` shape, zero elevation, fixed to bottom.
- **Triggers**:
  - `Enter` (Submit)
  - `Shift+Enter` (Newline)
  - Click Send icon.

### 2. `suggestion-chip`
<<<<<<< HEAD

=======
>>>>>>> feature/short-term-tasks
- **Purpose**: Quick-start prompts for new users.
- **Visuals**: Flat, 1px `{colors.hairline}` border, `{colors.canvas-parchment}` background. No shadow.
- **Triggers**:
  - `click` -> auto-fills `chat-composer` AND immediately triggers `api_chat_stream`.

<<<<<<< HEAD
### 3. `button`

- **Purpose**: Canonical pill button primitive for shared UI actions.
- **Visuals**: `{rounded.pill}`, explicit primary/secondary/ghost variants, consistent disabled/focus-visible treatment.
- **Notes**:
  - Use instead of inline button markup when a surface needs the standard GrowChat pill geometry.
  - Shared implementation lives in `public/js/shared/components/button.js`.

### 4. `message-bubble`

=======
### 3. `message-bubble`
>>>>>>> feature/short-term-tasks
- **Purpose**: Renders user and assistant markdown.
- **Variants**:
  - `user`: Aligned right, light gray or primary tinted background.
  - `assistant`: Aligned left, transparent background.
  - `assistant_streaming`: Displaying a blinking cursor caret at the end of the text node.
  - `assistant_error`: Red border or tint, accompanied by a "Retry" action icon.
