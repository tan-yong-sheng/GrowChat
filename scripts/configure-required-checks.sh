#!/usr/bin/env bash
# Configure required status checks on the main-branch-protection ruleset.
#
# This script adds/updates the "required_status_checks" rule on the existing
# GitHub ruleset (ID 16501657) for the main branch. It preserves all other
# rules (non_fast_forward, pull_request, required_linear_history,
# code_scanning, code_quality).
#
# Prerequisites:
#   - gh CLI authenticated with repo admin access
#   - The check names must have appeared at least once on the repo
#     (GitHub won't let you require checks it hasn't seen yet)
#
# Usage:
#   ./scripts/configure-required-checks.sh          # apply
#   ./scripts/configure-required-checks.sh --dry-run # preview only

set -euo pipefail

REPO="tan-yong-sheng/GrowChat"
RULESET_ID=16501657
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "=== DRY RUN — no changes will be made ==="
fi

# The three required check names (must match job `name:` or default job name exactly)
REQUIRED_CHECKS=(
  "Local + CI guardrails"
  "CodeQL Analysis (javascript)"
  "semgrep"
)

# Build the required_status_checks JSON array
checks_json=$(printf '%s\n' "${REQUIRED_CHECKS[@]}" | jq -R . | jq -s .)
checks_json=$(echo "$checks_json" | jq '[.[] | {context: .}]')

echo "Required checks to enforce:"
echo "$checks_json" | jq .

# Full ruleset payload — preserves all existing rules and adds required_status_checks
payload=$(jq -n \
  --argjson checks "$checks_json" \
  '{
  "name": "main-branch-protection",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "exclude": [],
      "include": ["refs/heads/main"]
    }
  },
  "rules": [
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash", "merge"]
      }
    },
    { "type": "required_linear_history" },
    {
      "type": "required_status_checks",
      "parameters": {
        "required_status_checks": $checks,
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false
      }
    },
    {
      "type": "code_scanning",
      "parameters": {
        "code_scanning_tools": [
          {
            "tool": "CodeQL",
            "security_alerts_threshold": "high_or_higher",
            "alerts_threshold": "errors"
          }
        ]
      }
    },
    {
      "type": "code_quality",
      "parameters": {
        "severity": "errors"
      }
    }
  ]
}' --argjson checks "$checks_json")

if $DRY_RUN; then
  echo ""
  echo "Would PUT to repos/$REPO/rulesets/$RULESET_ID with:"
  echo "$payload" | jq .
  exit 0
fi

echo ""
echo "Updating ruleset $RULESET_ID..."

result=$(gh api \
  -X PUT \
  "repos/$REPO/rulesets/$RULESET_ID" \
  --input - <<< "$payload")

echo "✅ Ruleset updated successfully."
echo ""
echo "Required status checks now enforced:"
echo "$result" | jq '.rules[] | select(.type == "required_status_checks")'
echo ""
echo "Branches must be up to date before merging: $(echo "$result" | jq '.rules[] | select(.type == "required_status_checks") | .parameters.strict_required_status_checks_policy')"
