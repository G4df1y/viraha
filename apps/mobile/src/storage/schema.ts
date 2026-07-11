import type { SqlDatabase } from './database';

const MOBILE_SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS companions (
  id TEXT PRIMARY KEY NOT NULL,
  template_id TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  user_display_name TEXT NOT NULL,
  user_age_band TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_connections (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  credential_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  companion_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_session_created
ON messages (session_id, created_at);
`;

export async function createMobileSchema(database: SqlDatabase): Promise<void> {
  await database.execAsync(MOBILE_SCHEMA);
}
