# Semgrep Debt Cleanup Checklist

Goal: pay down old Semgrep debt in runtime code first, while keeping CI report-only until the baseline is small enough to gate.

## Setup

- [x] Keep Semgrep report-only for now
- [x] Scan runtime code only (`src/`, `public/`)
- [x] Use narrower security-focused packs + GrowChat custom rules
- [x] Treat current findings as baseline, not regression failures
- [x] Save scan output for comparison after each cleanup batch

## Triage

- [ ] Group findings into:
  - [ ] true vulnerability
  - [ ] acceptable pattern
  - [ ] refactor-needed
  - [ ] noise / false positive
- [ ] Mark findings outside runtime scope for later passes
- [ ] Record which rules are intentionally accepted
- [ ] Record which rules need narrowing or suppression

## Fix first: real risk

- [x] Review user-input-driven regex construction
- [x] Review unsafe logging sites with dynamic strings
- [ ] Review any real secret exposure outside tests
- [x] Fix highest-risk runtime findings first

## Fix second: noisy but real hygiene

- [ ] Normalize dynamic logs to safer constant-first patterns where needed
- [x] Decide whether helper escape patterns should be suppressed or rule-narrowed
- [x] Keep accepted helper code documented as intentional

## Policy tuning

- [ ] Add or refine GrowChat-specific Semgrep rules for real repo conventions
- [ ] Narrow generic rules that overfire on accepted helper patterns
- [ ] Keep tests and migrations excluded from the first cleanup wave
- [ ] Re-run scan after each rule change to confirm signal improves

## Verification

- [ ] Re-run Semgrep locally on runtime code after each fix batch
- [x] Confirm targeted finding cluster dropped
- [ ] Confirm no new runtime blockers were introduced
- [ ] Keep results comparable to the original baseline

## Later stage

- [ ] When baseline is small enough, consider CI gate mode
- [ ] Only flip to blocking after accepted patterns are documented and noise is low
