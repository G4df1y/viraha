import { getDb } from "@viraha/db"
import { users, profiles } from "@viraha/db"
import { eq } from "drizzle-orm"
import crypto from "crypto"

export class ProfileManager {
  async getOrCreateUser(externalId: string, channel: string, name: string): Promise<string> {
    const db = getDb()

    let user = await db.query.users.findFirst({
      where: (u, { eq, and }) => and(eq(u.externalId, externalId), eq(u.channel, channel)),
    })

    if (user) return user.id

    const id = crypto.randomUUID()
    await db.insert(users).values({ id, externalId, channel, name })
    await db.insert(profiles).values({ userId: id, lastUpdated: new Date().toISOString() })

    return id
  }

  async ensureUser(userId: string, externalId: string, channel: string, name: string): Promise<string> {
    const db = getDb()

    const existing = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })

    if (!existing) {
      await db.insert(users).values({ id: userId, externalId, channel, name })
    }

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, userId),
    })

    if (!profile) {
      await db.insert(profiles).values({ userId, lastUpdated: new Date().toISOString() })
    }

    return userId
  }

  async getProfile(userId: string) {
    const db = getDb()
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, userId),
    })
    if (!profile) return null

    return {
      ...profile,
      equipment: parseJson<string[]>(profile.equipment, []),
      injuries: parseJson<string[]>(profile.injuries, []),
      preferences: parseJson<Record<string, unknown>>(profile.preferences, {}),
      painPoints: parseJson<string[]>(profile.painPoints, []),
      interests: parseJson<string[]>(profile.interests, []),
    }
  }

  async updateProfile(userId: string, data: Record<string, unknown>) {
    const db = getDb()

    const serializable = { ...data, lastUpdated: new Date().toISOString() } as Partial<typeof profiles.$inferInsert>
    if (data.preferences) serializable.preferences = JSON.stringify(data.preferences)
    if (data.painPoints) serializable.painPoints = JSON.stringify(data.painPoints)
    if (data.interests) serializable.interests = JSON.stringify(data.interests)

    await db
      .update(profiles)
      .set(serializable)
      .where(eq(profiles.userId, userId))
  }
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

