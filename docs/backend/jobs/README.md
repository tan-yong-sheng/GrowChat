# Background Jobs

This directory maps asynchronous tasks, cron schedules, and queue consumers (e.g., async document text extraction for RAG).

## Document text extraction — REMOVED

As of the repo-reduction pass (see `docs/REDUCTION_EXECUTION_REPORT.md` row 4), the async document text extraction pipeline has been removed. No background jobs are scheduled for uploads.

- `src/services/extraction.js` and `src/services/parsers/` are deleted.
- `extractDocumentText` is no longer called from `files-upload-helpers.js`.
- New document rows are inserted with `extraction_status = 1` (done) immediately.
- The `/api/files/:id/process/status` endpoint returns `done`.
- The `/api/files/:id/content` endpoint returns the parsed JSON or text excerpt for JSON/text files, or a status object for binary files.
