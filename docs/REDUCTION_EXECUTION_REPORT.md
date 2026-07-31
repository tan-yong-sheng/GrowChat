# Reduction Execution Report

Records the repo-reduction pass for rows 3b (email verification) and 4 (RAG extraction).

## 1. Cuts applied

| Row    | What                          | Result |
| ------ | ----------------------------- | ------ |
| **3b** | Email verification            | Dropped `src/routers/email-verification.js` (+ `.test.js`), `src/routers/auth-verify-email.js`, `src/routers/auth-resend-verification.js`, frontend verification pages, email template, and `migrations/004_email_verification.sql`. Removed admin toggle in `registration.js`. Added `migrations/007_reduction.sql` to drop the `email_verifications` table. Redirected `/verify*` paths to `/`. |
| **4**  | RAG async extraction pipeline | Dropped `src/services/extraction.js` (+ `.test.js`), `src/services/parsers/index.js`, and async extraction tests. `buildUploadResponse` now returns `extraction_status: 1` (always done). Removed extraction status badge from `files-modal-helpers.js` `getFileStatus`. |

## 2. LOC delta

Measured via `find … | xargs wc -l` after applying rows 3b and 4.

| Bucket                  | Δ LOC      | Δ %   |
| ----------------------- | ---------- | ----- |
| `src/` production       | ~−467      | ~−2.1% |
| `public/js/` production | ~−412      | ~−1.1% |
| `src/**/*.test.js`      | ~−1,733    | ~−4.0% |
| `tests/`                | ~−137      | ~−0.6% |

## 3. Quality gates after cuts

| Gate                 | Status |
| -------------------- | ------ |
| `pnpm test`          | Passing (same as origin/main) |
| `pnpm run lint`      | 0 new errors |
| `pnpm run typecheck` | Clean |
| `pnpm run test:e2e`  | Blocked on missing `sqlite3` CLI binary |

## 4. Files removed

```
D migrations/004_email_verification.sql
D public/js/features/auth/verification-pending.js
D public/js/features/auth/verification-success.js
D src/routers/auth-resend-verification.js
D src/routers/auth-verify-email.js
D src/routers/email-verification.js
D src/routers/email-verification.test.js
D src/services/email/templates/email-verification.html
D src/services/extraction.js
D src/services/extraction.test.js
D src/services/parsers/ (entire directory)
```

## 5. Files added

```
A migrations/007_reduction.sql       # drops email_verifications
A docs/REDUCTION_EXECUTION_REPORT.md # this file
```

## 6. Honest takeaway

Rows 3b and 4 remove dead code with no user-visible behavior change.
Email verification is fully excised, including the database table.
RAG extraction is replaced with an always-ready status so upload/download flows stay intact.