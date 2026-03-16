ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'completed';
ALTER TABLE messages ADD COLUMN error_code TEXT;
ALTER TABLE messages ADD COLUMN error_message TEXT;
UPDATE messages SET status = 'completed' WHERE status IS NULL;
