# Native Search and URL Fetch Plan

## Goal

Add provider-native web search and URL fetch support to GrowChat in a way that feels like MCP tool calling in the UI.

## Evidence From Local Repos

- `opencode/packages/opencode/src/provider/sdk/copilot/responses/openai-responses-prepare-tools.ts`
- `opencode/packages/opencode/src/provider/sdk/copilot/chat/openai-compatible.ts`
- `opencode/packages/opencode/src/tool/websearch.ts`
- `ai/content/providers/01-ai-sdk-providers/03-openai.mdx`
- `ai/content/providers/01-ai-sdk-providers/05-anthropic.mdx`
- `ai/content/providers/01-ai-sdk-providers/15-google-generative-ai.mdx`
- `ai/content/providers/01-ai-sdk-providers/16-google-vertex.mdx`
- `ai/packages/openai/src/openai-tools.ts`
- `ai/packages/anthropic/src/anthropic-prepare-tools.ts`
- `ai/packages/google-vertex/src/google-vertex-tools.ts`
- `ai/packages/ai/src/generate-text/stream-text.test.ts`

## Feasibility Matrix

| Provider family | Native web search | Native URL fetch | Notes |
| --- | --- | --- | --- |
| OpenAI | Yes | Partial / not evidenced in current local docs | Search is first-class; URL fetch should be treated as separate unless the target API exposes it. |
| Gemini | Yes | Yes | `googleSearch` and `urlContext` are first-class in the SDK/docs. |
| Claude | Yes | Yes | Anthropic exposes `web_search` and `web_fetch` as provider-defined tools. |
| OpenAI-compatible | Depends on upstream | Depends on upstream | The generic compatible adapter does not guarantee provider-defined tools. |
| Gemini-compatible | Depends on upstream | Depends on upstream | Feasible only if the adapter exposes Google-native search/context tools. |
| Claude-compatible | Depends on upstream | Depends on upstream | Feasible only if the adapter preserves Anthropic-style server tools. |

## Recommendation

Use one unified UI concept for both search and fetch:

- Provider-native tool turn.
- Tool status row or activity rail.
- Source cards for URLs.
- Final assistant answer after tool completion.

Do not present web search or URL fetch as ordinary text inputs in the main model row. Keep those as advanced settings and show them only when the provider/model can actually use them.

## Compatibility Policy

For OpenAI-compatible, Gemini-compatible, Claude-compatible endpoints, default native web search and native URL fetch to `disabled` unless the model is explicitly enabled in `/admin/settings/models`.

Reasoning:

- Compatibility does not imply native provider tools.
- Some endpoints only support plain chat/completions, not server-side search/fetch tools.
- A disabled-by-default stance avoids showing settings that do nothing or fail silently.
- The admin page can then act as the source of truth for whether a model supports `webSearch`, `urlFetch`, or both.

Recommended UI behavior:

- Show the capability toggles only when the provider/model has a known native implementation or an explicit override.
- If a compatible endpoint is selected, show the search/fetch controls as disabled with a short explanation until enabled.
- Keep the toggle state persisted per model, not per provider family, so overrides stay intentional.
- Treat provider claims as capability flags, not assumptions based on API shape.

## UI Impact

### Model Settings Page

- Keep the main row compact.
- Persist model name, model id, status, and provider.
- Put native search and URL fetch controls behind a disclosure panel.
- Show capability badges in the row header, such as `search`, `fetch`, or `grounding`.

### Turn-Level UI

- Show a visible step for `searching`.
- Show a visible step for `fetching url`.
- Show tool errors inline, not as a generic toast only.
- Show citations or source links after the tool finishes.

### URL Page Variants

- Single short article: one source card and one fetch step.
- Long docs: collapsed source groups, not a huge inline dump.
- Multiple URLs: stacked source chips with counts.
- Error or blocked URL: preserve the URL and show the failure reason.
- Mixed search + fetch turn: show search first, then fetch, then answer.

## Plan

1. Define a provider capability model for `webSearch`, `urlFetch`, `citations`, and `searchContext`.
2. Persist capability settings per model, not as global fields.
3. Render the settings UI with a compact row and an expandable advanced section.
4. Normalize provider tool events into one UI event stream.
5. Add a shared source renderer for URLs, excerpts, and error states.
6. Fall back to local MCP-style web search or fetch when a provider lacks native support.

## Notes

- OpenAI and Anthropic expose native web search as provider tools, so the app should pass tool config through rather than fake it client-side.
- Gemini has both search grounding and URL context, so it should be treated as a two-capability provider.
- OpenAI-compatible adapters should be treated as transport adapters, not proof that native web search exists.
- OpenAI-compatible endpoints should default to disabled for native search/fetch until model-level support is explicitly turned on.
- The UI should behave like MCP because the user cares about the sequence of work, not which backend produced it.
