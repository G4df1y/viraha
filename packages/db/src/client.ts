import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema.js"

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _sqlite: ReturnType<typeof createClient> | null = null

export function initDb(dbPath: string) {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
    _db = null
  }

  _sqlite = createClient({ url: `file:${dbPath}` })
  _sqlite.execute("PRAGMA journal_mode=WAL")
  _sqlite.execute("PRAGMA foreign_keys=ON")
  _db = drizzle(_sqlite, { schema })
}

export function getDb() {
  if (!_db) throw new Error("Database not initialized. Call initDb(dbPath) first.")
  return _db!
}

export function getSqliteClient() {
  if (!_sqlite) getDb()
  return _sqlite!
}

export function closeDb() {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
    _db = null
  }
}

export { schema }

