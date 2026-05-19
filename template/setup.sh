#!/usr/bin/env bash
#
# GrowChat Quick Start Script
#
# Detects Node.js, installs dependencies, and runs the setup wizard.
# Intended for new users who want to get running in under 2 minutes.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tan-yong-sheng/GrowChat/main/template/setup.sh | bash
#   — or —
#   git clone https://github.com/tan-yong-sheng/GrowChat.git && cd GrowChat && bash template/setup.sh

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
ok() { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
fail() {
	echo -e "${RED}❌ $*${NC}" >&2
	exit 1
}

# ── Pre-flight checks ──────────────────────────────────────────────────────

info "GrowChat Quick Start"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
	fail "Node.js is not installed. Install it from https://nodejs.org (v18+ required)"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
	fail "Node.js 18+ required. You have $(node -v). Upgrade at https://nodejs.org"
fi
ok "Node.js $(node -v) detected"

# Check pnpm
if ! command -v pnpm &>/dev/null; then
	warn "pnpm is not installed. Installing via corepack..."
	corepack enable || npm install -g pnpm || fail "Could not install pnpm. Install manually: npm i -g pnpm"
fi
ok "pnpm $(pnpm -v) detected"

# Check wrangler auth
if ! pnpm exec wrangler whoami &>/dev/null 2>&1; then
	warn "Not logged into Cloudflare. Launching login..."
	pnpm exec wrangler login || fail "Cloudflare login failed. Run: pnpm exec wrangler login"
fi
ok "Cloudflare authentication confirmed"

# ── Install dependencies ───────────────────────────────────────────────────

info "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies installed"

# ── Run setup wizard ───────────────────────────────────────────────────────

info "Launching setup wizard..."
echo ""
node scripts/setup-wizard.js

echo ""
ok "Setup complete! GrowChat is deployed."
info "Run 'pnpm run dev' for local development."
