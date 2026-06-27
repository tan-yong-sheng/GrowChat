#!/usr/bin/env bash
# Runs the full E2E suite.
# test-e2e.js handles server startup, DB init, public_registration_status,
# and user seeding — all reading TEST_EMAIL/TEST_PASSWORD from .dev.vars.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
pnpm run test:e2e