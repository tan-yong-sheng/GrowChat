-- Reduction migration: drop features removed in codebase reduction Phase 2

-- Drop email verification subsystem (row 3b)
DROP TABLE IF EXISTS email_verifications;