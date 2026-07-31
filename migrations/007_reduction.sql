-- Reduction migration: drop features removed in codebase reduction Phase 2

-- Backfill documents that were pending extraction so they reflect the new
-- always-done status after the async extraction pipeline was removed (row 4).
UPDATE documents SET extraction_status = 1 WHERE extraction_status = 0;

-- Drop email verification subsystem (row 3b)
DROP TABLE IF EXISTS email_verifications;