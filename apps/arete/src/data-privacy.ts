import { getSqliteClient } from "@viraha/db"
import type { EventStore } from "@viraha/runtime"
import type { MemoryEngine } from "@viraha/memory"
import type { CompanionEngine } from "@viraha/relationship"

/**
 * P0.3 — privacy & data boundaries.
 *
 * Two user-facing capabilities live here:
 *   1. exportUserData — a user can pull their own memory, profile, relationship
 *      and trace events as a single JSON document.
 *   2. deleteUserData  — a user can erase their own data; afterwards the same
 *      queries return nothing.
 *
 * Everything is scoped by userId. Cross-user access is prevented at the API
 * layer (web.ts always derives the userId from the cookie, never from a query
 * param), and these helpers trust that caller contract.
 */

export interface UserExport {
  userId: string
  exportedAt: string
  profile: unknown
  memories: unknown[]
  sessionSummaries: unknown[]
  relationship: unknown
  relationshipSummary: string
  events: unknown[]
}

/**
 * Collect everything Viraha knows about a user into a plain JSON object.
 * Read-only; never mutates state.
 */
export async function exportUserData(
  memory: MemoryEngine,
  companion: CompanionEngine,
  eventStore: EventStore,
  userId: string,
): Promise<UserExport> {
  const [profile, memories, sessionSummaries, relationship, events] = await Promise.all([
    memory.profile.getProfile(userId).catch(() => null),
    memory.store.getEntries(userId).catch(() => []),
    memory.store.getSessionSummaries(userId).catch(() => []),
    companion.relationship.getOrCreate(userId).catch(() => null),
    eventStore.query({ userId, limit: 500 }).catch(() => []),
  ])

  const relationshipSummary = relationship
    ? companion.relationship.getRelationshipSummary(relationship)
    : ""

  return {
    userId,
    exportedAt: new Date().toISOString(),
    profile,
    memories,
    sessionSummaries,
    relationship,
    relationshipSummary,
    events,
  }
}

/**
 * Tables that hold per-user data with a direct `user_id` column. Listed
 * explicitly (not via introspection) so the deletion surface is auditable.
 *
 * `messages` and `plans` are handled separately because they reference the
 * user indirectly (via sessions / goals). `users` is deleted last.
 */
const PER_USER_TABLES = [
  "profiles",
  "memory_entries",
  "sessions",
  "relationships",
  "mood_history",
  "achievements",
  "milestones",
  "scheduled_messages",
  "scheduled_jobs",
  "goals",
  "diary_entries",
  "events",
  "training_plans",
  "training_sessions",
  "food_logs",
  "event_store",
  "channel_bindings",
] as const

/**
 * Erase all data belonging to a user. Safe to call for an unknown userId
 * (each statement is a no-op then). Returns a summary of what was deleted.
 *
 * Order matters: indirect-dependency tables (messages, plans) are cleared
 * before their parent tables (sessions, goals), and the `users` row is removed
 * last.
 */
export async function deleteUserData(userId: string): Promise<{ userId: string; tablesCleared: number }> {
  const sqlite = getSqliteClient()

  // Indirect dependencies first — they reference the user via sessions / goals.
  await sqlite.execute({
    sql: "DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)",
    args: [userId],
  })
  await sqlite.execute({
    sql: "DELETE FROM plans WHERE goal_id IN (SELECT id FROM goals WHERE user_id = ?)",
    args: [userId],
  })

  // All directly per-user tables.
  for (const table of PER_USER_TABLES) {
    await sqlite.execute({ sql: `DELETE FROM ${table} WHERE user_id = ?`, args: [userId] })
  }

  // Finally the user record itself.
  await sqlite.execute({ sql: "DELETE FROM users WHERE id = ?", args: [userId] })

  return { userId, tablesCleared: PER_USER_TABLES.length + 2 }
}
