import { createClient } from "@libsql/client"
import path from "path"
import fs from "fs"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  age INTEGER,
  height_cm REAL,
  weight_kg REAL,
  goal TEXT,
  experience TEXT,
  equipment TEXT,
  injuries TEXT,
  available_minutes INTEGER,
  preferences TEXT DEFAULT '{}',
  pain_points TEXT DEFAULT '[]',
  interests TEXT DEFAULT '[]',
  last_updated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  summary TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT,
  tool_calls TEXT,
  tool_results TEXT,
  tokens INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relationships (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  score INTEGER NOT NULL DEFAULT 0,
  trust INTEGER NOT NULL DEFAULT 30,
  intimacy INTEGER NOT NULL DEFAULT 10,
  initiative INTEGER NOT NULL DEFAULT 20,
  attachment INTEGER NOT NULL DEFAULT 5,
  level INTEGER NOT NULL DEFAULT 1,
  current_xp INTEGER NOT NULL DEFAULT 0,
  xp_to_next INTEGER NOT NULL DEFAULT 100,
  decay_rate REAL NOT NULL DEFAULT 1.0,
  last_interaction_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mood_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  mood TEXT NOT NULL,
  intensity INTEGER NOT NULL,
  context TEXT,
  source TEXT NOT NULL DEFAULT 'inferred',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  milestone_type TEXT NOT NULL,
  value INTEGER NOT NULL,
  description TEXT,
  achieved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  cron_expression TEXT,
  condition TEXT,
  template TEXT NOT NULL,
  next_fire_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  run_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  locked_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_due
  ON scheduled_jobs(status, run_at, created_at);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  target REAL,
  current REAL NOT NULL DEFAULT 0,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id),
  title TEXT NOT NULL,
  steps TEXT NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diary_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  content TEXT NOT NULL,
  mood_tags TEXT,
  generated_by TEXT NOT NULL DEFAULT 'companion',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  occurred_at TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  split_type TEXT NOT NULL,
  days_per_week INTEGER NOT NULL,
  sessions_per_week INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES training_plans(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT,
  date TEXT NOT NULL,
  duration_minutes INTEGER,
  exercises TEXT NOT NULL,
  rpe REAL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS food_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  foods TEXT NOT NULL,
  total_calories REAL,
  total_protein REAL,
  total_carbs REAL,
  total_fat REAL,
  created_at TEXT NOT NULL
);

-- FTS5 for message search
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content, content=messages, content_rowid=rowid
);

CREATE TABLE IF NOT EXISTS event_store (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  correlation_id TEXT NOT NULL,
  payload TEXT DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_bindings (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_bindings_platform_user
  ON channel_bindings(platform, platform_user_id);
`

export async function migrate(dbPath?: string) {
  const resolvedPath = dbPath ?? path.join(process.cwd(), "data", "companion.db")
  const dir = path.dirname(resolvedPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const client = createClient({ url: `file:${resolvedPath}` })

  const statements = SCHEMA_SQL.split(";").filter(s => s.trim().length > 0)
  for (const stmt of statements) {
    await client.execute(stmt + ";")
  }

  client.close()
  console.log(`Migration complete: ${resolvedPath}`)
}

if (process.argv[1]?.includes("migrate")) {
  migrate().catch(console.error)
}

