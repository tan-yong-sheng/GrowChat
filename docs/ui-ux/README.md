# UI/UX Documentation Architecture

This directory contains the knowledge graph for the GrowChat user interface. It is explicitly structured to map not just user journeys, but the relationships between UI elements, application states, and cross-page dependencies. This structure is designed to facilitate "bug hunting" and proactive edge-case discovery.

## Documentation Structure

This repository separates UI/UX documentation by abstraction level. Each folder answers a different question about the interface:

| Folder                  | Purpose                                                         | Question Answered                            |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| **`/ia`**               | Information Architecture & navigation hierarchy.                | _What pages exist?_                          |
| **`/user-flows`**       | High-level journeys (e.g., checkout, login).                    | _How does a user move?_                      |
| **`/wireflows`**        | UI + Flow hybrid (specific clickable elements).                 | _What UI elements are involved?_             |
| **`/interaction-maps`** | Graphs of cross-page interactions and API triggers.             | _How do elements connect across pages?_      |
| **`/components`**       | Reusability maps and variant states.                            | _What is reused and where?_                  |
| **`/states`**           | Lightweight UI state machines (e.g., idle -> loading -> error). | _What can break or enter an orphaned state?_ |
| **`/pages`**            | Page-centric documentation tying the above together.            | _What exactly happens on this page?_         |
| **`/assets`**           | Screenshots, diagrams, and visual references.                   | _What does it look like?_                    |

## Workflow for Bug Discovery

When debugging or designing new features, use this knowledge graph:

1. Check **`/user-flows`** for the happy path.
2. Check **`/states`** to understand the hidden failure modes (e.g., network disconnects, invalid inputs).
3. Check **`/interaction-maps`** to see if a change to a component affects other seemingly unrelated pages.
4. Prefer canonical primitives in `public/js/shared/components/` before adding new ad-hoc UI markup.
5. Document all visual deviations and unhandled edges in the root `BUGS.md`.
