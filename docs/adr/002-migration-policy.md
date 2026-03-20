# ADR 002: Forward-Only Migration Policy

## Status
Accepted

## Context
The project now has a growing D1 migration history and several schema compatibility checks.

## Decision
Use forward-only migrations for schema changes. Keep migration filenames sequential and avoid renumbering unless doing a deliberate reset plan.

## Consequences
- New schema changes remain easy to audit.
- Historical migrations stay stable once deployed.
- Migration validation can flag duplicates and ordering mistakes before deploy.
