## Problem Statement

GrowChat has started using scoped guardrails to keep code quality checks focused and reviewable, but the current workflow still puts too much logic directly into Husky hooks and does not yet enforce the strongest boundary rules around frontend code touching backend implementation details.

The project needs a cleaner, more maintainable guardrail setup that keeps hook logic thin, centralizes command orchestration in npm scripts, and adds explicit fences so browser-side code cannot drift into server-only concerns like direct D1 or KV access.

## Solution

Add a small guardrail refinement pass that makes Husky hooks thin wrappers around npm scripts and adds structural protection for frontend/backend boundaries.

The resulting setup should:

- keep `.husky/*` minimal and stable
- move hook command chains into package scripts
- enforce frontend import boundaries so `public/js/**` does not depend on `src/**`
- catch accidental worker-env leakage in frontend code with Semgrep
- keep the current scoped-first workflow intact so legacy debt remains visible but non-blocking

## User Stories

1. As a developer, I want Husky hooks to stay thin, so that I can understand and maintain pre-commit and pre-push behavior quickly.
2. As a developer, I want hook logic centralized in npm scripts, so that I can reuse the same checks from the terminal and CI.
3. As a developer, I want pre-push checks to run a predictable composite script, so that the branch gate is easy to audit.
4. As a developer, I want pre-commit checks to remain focused on fast local validation, so that I do not pay unnecessary friction for every edit.
5. As a reviewer, I want boundary rules that block frontend code from importing server modules, so that architecture stays clean.
6. As a reviewer, I want accidental `public/js/**` access to worker bindings like D1 or KV to be caught, so that server-only data access never leaks into browser code.
7. As a maintainer, I want boundary rules to be scoped-first and warning-friendly where legacy debt exists, so that the repo does not become blocked by old violations.
8. As a maintainer, I want structural rules to live in the right tool, so that import graph checks use dependency-cruiser and pattern checks use Semgrep.
9. As a developer, I want the new guardrails to run from existing quality scripts, so that the workflow stays consistent with the rest of the repo.
10. As a developer, I want the new rules to be reviewable and testable, so that changes can be validated before landing.
11. As a developer, I want frontend code to remain free of server-only imports, so that browser bundles stay safe and predictable.
12. As a developer, I want direct D1 and KV access to remain server-side only, so that the app’s trust boundary stays intact.
13. As a maintainer, I want the hooks and guardrails to avoid brittle one-off shell chains, so that future changes do not require editing multiple places.
14. As a maintainer, I want the new guardrails to preserve the current scoped-first philosophy, so that enforcement grows without forcing repo-wide cleanup immediately.
15. As a developer, I want the guardrail commands to be available as scripts, so that I can run them locally without invoking Husky.
16. As a reviewer, I want a clear distinction between architecture rules and visual/style rules, so that lint does not become overloaded with design taste.
17. As a maintainer, I want no UI-philosophy lint changes in this batch, so that the scope stays focused on hooks and boundaries.
18. As a maintainer, I want the new checks to fit the current Tailwind/vanilla-JS architecture, so that they reinforce existing patterns instead of inventing new ones.
19. As a developer, I want guardrail failures to point to a single root cause, so that fixing violations is straightforward.
20. As a developer, I want the repo state to remain clean after the guardrail update, so that the changes are easy to merge and review.

## Implementation Decisions

- Keep Husky hooks thin and delegate to npm scripts.
- Add composite scripts for hook entrypoints instead of embedding long shell chains in `.husky/*`.
- Preserve the scoped-first validation model rather than switching to repo-wide hard enforcement.
- Add a frontend-to-backend import fence so browser code cannot depend on server modules.
- Add a Semgrep rule for frontend code that flags direct access to worker environment bindings associated with D1 and KV.
- Keep guardrail logic split by concern: dependency-cruiser for import boundaries, Semgrep for code-pattern boundaries.
- Keep UI/style philosophy out of this batch.
- Retain the existing scoped guardrail scripts as the main validation path for changed files.
- Treat legacy violations outside the active scope as visible debt rather than blocking failures.
- Keep the guardrail surface small and explicit so future additions are easy to reason about.

## Testing Decisions

- Test external behavior of the guardrail workflow, not internal implementation details.
- Verify Husky entrypoints still execute the intended composite npm scripts.
- Verify dependency-cruiser flags frontend imports into server code.
- Verify Semgrep flags frontend access to forbidden worker environment bindings.
- Verify the scoped guardrail scripts remain green on the current repo surface.
- Prefer small focused tests around command wiring and rule behavior over broad integration tests.
- Use existing scoped guardrail checks as prior art for validating quality gates.
- Use existing unit-style rule checks where practical, rather than testing hook shell syntax directly.

## Out of Scope

- Repo-wide cleanup of all legacy dependency or lint violations.
- Broad design-philosophy lint rules for UI aesthetics.
- Switching the project to a different styling system or component framework.
- Backend schema changes.
- Runtime behavior changes in business logic unrelated to guardrails.
- Expanding the guardrails to every possible stylistic anti-pattern.
- Rewriting unrelated Husky hooks beyond the minimum needed for thin wrappers.

## Further Notes

This work is intentionally scoped-first.

The goal is to tighten structural safety and maintenance ergonomics without turning the repo into a full legacy cleanup effort. The new rules should help prevent new architecture drift while keeping existing debt visible and manageable.
