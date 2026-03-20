# ADR 001: Refactor by Boundary

## Status
Accepted

## Context
GrowChat had large routers and a frontend chat module that mixed transport, validation, state, and business rules.

## Decision
Split code by responsibility:

- `src/routers/` for HTTP wiring
- `src/chat/` for chat-domain helpers
- `src/llm/` for provider and streaming logic
- `src/services/` for reusable services
- `src/bootstrap/` for startup concerns

## Consequences
- Smaller files and clearer ownership
- Easier regression testing
- Less accidental coupling between routes and helpers
