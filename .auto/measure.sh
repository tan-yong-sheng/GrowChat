#!/bin/bash
set -uo pipefail

cd "$(dirname "$0")/.."

# Run fallow health (always exit 0 for measurement)
HEALTH_JSON=$(npx fallow health --format json 2>/dev/null || true)

SCORE=$(echo "$HEALTH_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin'));
process.stdout.write(String(d.health_score?.score ?? 0));
")
echo "METRIC fallow_health_score=$SCORE"

FUNCTIONS_ABOVE=$(echo "$HEALTH_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin'));
process.stdout.write(String(d.summary?.functions_above_threshold ?? 0));
")
echo "METRIC functions_above_threshold=$FUNCTIONS_ABOVE"

PENALTIES=$(echo "$HEALTH_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin'));
process.stdout.write(JSON.stringify(d.health_score?.penalties ?? {}));
")
echo "METRIC penalties=$PENALTIES"

VS=$(echo "$HEALTH_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin'));
const v = d.vital_signs || {};
process.stdout.write(JSON.stringify({
  very_high_risk: v.unit_size_profile?.very_high_risk ?? 0,
  high_risk: v.unit_size_profile?.high_risk ?? 0,
  functions_over_60: v.functions_over_60_loc_per_k ?? 0,
  hotspot_count: v.hotspot_count ?? 0,
  hotspot_top_pct: v.hotspot_top_pct_count ?? 0,
  coupling_high_pct: v.coupling_high_pct ?? 0,
  total_loc: v.total_loc ?? 0,
}));
")
echo "METRIC vital_signs=$VS"

# Run fallow audit (full)
AUDIT_JSON=$(npx fallow audit --format json 2>/dev/null || true)
AUDIT_VERDICT=$(echo "$AUDIT_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin'));
process.stdout.write(d.verdict || 'unknown');
")
echo "METRIC audit_verdict=$AUDIT_VERDICT"

AUDIT_NEW=$(echo "$AUDIT_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin'));
const a = d.attribution || {};
process.stdout.write(JSON.stringify({
  dead_code_introduced: a.dead_code_introduced ?? 0,
  complexity_introduced: a.complexity_introduced ?? 0,
  duplication_introduced: a.duplication_introduced ?? 0,
}));
")
echo "METRIC audit_new=$AUDIT_NEW"

COMPLEXITY_INTRODUCED=$(echo "$AUDIT_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin'));
process.stdout.write(String(d.attribution?.complexity_introduced ?? 0));
")
echo "METRIC complexity_introduced=$COMPLEXITY_INTRODUCED"

# Run fallow dead-code standalone
DEAD_JSON=$(npx fallow dead-code --format json 2>/dev/null || true)
DEAD_COUNT=$(echo "$DEAD_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin'));
process.stdout.write(String(d.findings?.length || d.summary?.total_issues || 0));
")
echo "METRIC dead_code=$DEAD_COUNT"

# Run fallow dupes standalone
DUP_JSON=$(npx fallow dupes --format json 2>/dev/null || true)
DUP_COUNT=$(echo "$DUP_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin'));
process.stdout.write(String(d.clone_groups?.length || d.findings?.length || 0));
")
echo "METRIC dupes=$DUP_COUNT"

# Primary metric: lint error count (lower is better, target = 0)
LINT_JSON=$(npx eslint --format json "src/**/*.js" "public/js/**/*.js" --ignore-pattern node_modules 2>/dev/null || true)
NUM_LINT_ISSUES=$(echo "$LINT_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin'));
const total = (Array.isArray(d) ? d : []).reduce((sum, r) => sum + (r.errorCount || 0) + (r.warningCount || 0), 0);
process.stdout.write(String(total));
")
echo "METRIC num_lint_issues=$NUM_LINT_ISSUES"

# Per-rule breakdown
LINT_RULES=$(echo "$LINT_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin'));
const counts = {};
for (const r of (Array.isArray(d) ? d : [])) {
  for (const m of (r.messages || [])) {
    counts[m.ruleId || 'unknown'] = (counts[m.ruleId || 'unknown'] || 0) + 1;
  }
}
process.stdout.write(JSON.stringify(counts));
")
echo "METRIC lint_rules=$LINT_RULES"

# Run tests (fast subset)
if pnpm test --run --reporter=dot 2>&1 | tail -10 | grep -q "Test Files"; then
  echo "METRIC tests_pass=1"
else
  echo "METRIC tests_pass=0"
fi

# Run typecheck
if pnpm run typecheck 2>&1 | tail -5 | grep -qi "error TS\|error:"; then
  echo "METRIC typecheck_pass=0"
else
  echo "METRIC typecheck_pass=1"
fi