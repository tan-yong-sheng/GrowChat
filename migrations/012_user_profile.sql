ALTER TABLE users ADD COLUMN avatar TEXT;
ALTER TABLE users ADD COLUMN avatar_emoji TEXT;
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'offline';
ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}';

UPDATE users SET status = 'offline' WHERE status IS NULL;
UPDATE users SET preferences = '{}' WHERE preferences IS NULL;
