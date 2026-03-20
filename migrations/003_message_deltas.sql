CREATE TABLE IF NOT EXISTS message_deltas (
  message_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_message_deltas_message_seq
  ON message_deltas (message_id, seq);
