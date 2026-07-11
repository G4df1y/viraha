import { getDb } from "@viraha/db"
import { channelBindings } from "@viraha/db"
import { eq, and, desc, max } from "drizzle-orm"
import crypto from "crypto"

/**
 * ChannelRouter — 跨平台统一身份路由。
 *
 * 核心原则：一个真人 = 一个 userId，多个平台 binding 可以挂在这个 userId 下。
 * 用户在 web/飞书/QQ/微信上的对话共享同一份记忆和关系状态。
 *
 * 工作流程：
 *   - 首次从某平台来：resolveUserId 创建 userId + binding
 *   - 后续从同平台来：lookupBinding 查到已有 userId
 *   - 跨平台绑定：linkPlatform 把新平台 binding 挂到已有 userId 上
 *   - token 绑定：web 生成 token → 用户在飞书发 /bind <token> → 自动合并身份
 *
 * 示例：
 *   1. 用户在 web 聊 → resolveUserId("web", cookie) → userId=U1
 *   2. 用户在 web 点"绑定飞书" → createLinkToken(U1) → token=T
 *   3. 用户在飞书发 "/bind T" → consumeLinkToken(T, "feishu", open_id)
 *      → linkPlatform(U1, "feishu", open_id) → 自动合并
 *   4. 之后从飞书来 → lookupBinding 返回 U1（合并）
 *   5. web 和飞书共享 U1 的所有记忆、关系状态、训练历史
 */

interface PendingLink {
  token: string
  userId: string
  createdAt: number
  expiresAt: number
}

const TOKEN_TTL_MS = 5 * 60 * 1000 // 5 分钟
const TOKEN_LENGTH = 6 // 短 token，方便手机输入

export class ChannelRouter {
  private pendingLinks = new Map<string, PendingLink>()
  /**
   * 查找或创建内部 userId。
   * @param platform 平台标识
   * @param platformUserId 平台侧用户 ID
   * @param name 可选的用户名（首次创建时写入）
   * @returns 内部 userId
   */
  async resolveUserId(
    platform: string,
    platformUserId: string,
    name?: string,
  ): Promise<string> {
    // 1. 先查绑定
    const existing = await this.lookupBinding(platform, platformUserId)
    if (existing) return existing.userId

    // 2. 没有就建 user + binding
    const db = getDb()
    const userId = crypto.randomUUID()
    const displayName = name || `${platform}:${platformUserId.slice(-8)}`

    await db.insert(channelBindings).values({
      id: crypto.randomUUID(),
      platform,
      platformUserId,
      userId,
      displayName,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    })

    return userId
  }

  /** 查绑定（不创建） */
  async lookupBinding(platform: string, platformUserId: string): Promise<{ userId: string; displayName: string | null } | null> {
    const db = getDb()
    const rows = await db.select()
      .from(channelBindings)
      .where(and(
        eq(channelBindings.platform, platform),
        eq(channelBindings.platformUserId, platformUserId),
      ))
      .limit(1)

    if (rows.length === 0) return null
    return { userId: rows[0].userId, displayName: rows[0].displayName }
  }

  /**
   * 把一个新平台 binding 挂到已有 userId 上。
   * 用于跨平台绑定：用户在 web 聊了一阵，又在飞书聊，可以把飞书身份合并到 web userId，
   * 之后两个平台共享同一份记忆。
   *
   * @param targetUserId 要合并到的 userId
   * @param platform 新平台的标识
   * @param platformUserId 新平台的用户 ID
   */
  async linkPlatform(
    targetUserId: string,
    platform: string,
    platformUserId: string,
  ): Promise<void> {
    // 如果该 platform+platformUserId 已绑定到别的 userId，先删旧 binding（身份合并）
    const db = getDb()
    await db.delete(channelBindings).where(and(
      eq(channelBindings.platform, platform),
      eq(channelBindings.platformUserId, platformUserId),
    ))

    await db.insert(channelBindings).values({
      id: crypto.randomUUID(),
      platform,
      platformUserId,
      userId: targetUserId,
      displayName: `${platform}:${platformUserId.slice(-8)}`,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    })
  }

  /** 列出某 userId 绑定的所有平台（查看跨平台身份） */
  async listBindingsByUser(userId: string): Promise<Array<{ platform: string; platformUserId: string; displayName: string | null; lastSeenAt: string | null }>> {
    const db = getDb()
    return db.select({
      platform: channelBindings.platform,
      platformUserId: channelBindings.platformUserId,
      displayName: channelBindings.displayName,
      lastSeenAt: channelBindings.lastSeenAt,
    })
      .from(channelBindings)
      .where(eq(channelBindings.userId, userId))
  }

  /** 更新最后活跃时间 */
  async touch(platform: string, platformUserId: string): Promise<void> {
    const db = getDb()
    await db.update(channelBindings)
      .set({ lastSeenAt: new Date().toISOString() })
      .where(and(
        eq(channelBindings.platform, platform),
        eq(channelBindings.platformUserId, platformUserId),
      ))
  }

  /** 列出某平台的所有绑定（调试/管理用） */
  async listByPlatform(platform: string): Promise<Array<{ platformUserId: string; userId: string; displayName: string | null; lastSeenAt: string | null }>> {
    const db = getDb()
    return db.select({
      platformUserId: channelBindings.platformUserId,
      userId: channelBindings.userId,
      displayName: channelBindings.displayName,
      lastSeenAt: channelBindings.lastSeenAt,
    })
      .from(channelBindings)
      .where(eq(channelBindings.platform, platform))
  }

  /** 列出最近活跃的所有 userId（去重，跨平台） */
  async listActiveUsers(limit = 20): Promise<Array<{ userId: string; lastSeenAt: string | null }>> {
    const db = getDb()
    const rows = await db.select({
      userId: channelBindings.userId,
      lastSeenAt: max(channelBindings.lastSeenAt),
    })
      .from(channelBindings)
      .groupBy(channelBindings.userId)
      .orderBy(desc(max(channelBindings.lastSeenAt)))
      .limit(limit)

    return rows.map(row => ({
      userId: row.userId,
      lastSeenAt: row.lastSeenAt,
    }))
  }

  /**
   * 生成一次性绑定 token。
   * 用户在 web 生成 token → 在飞书发 "/bind <token>" → consumeLinkToken 自动合并身份。
   *
   * @param userId 要绑定的目标 userId（通常是当前 web 用户的 userId）
   * @returns 6 位短 token（5 分钟内有效，一次性使用）
   */
  createLinkToken(userId: string): string {
    // 清理已过期的 token
    this.cleanupExpiredTokens()

    // 生成 6 位大写字母数字 token（避免易混淆字符 0/O/1/I/L）
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    let token: string
    do {
      token = ""
      const bytes = crypto.randomBytes(TOKEN_LENGTH)
      for (let i = 0; i < TOKEN_LENGTH; i++) {
        token += chars[bytes[i] % chars.length]
      }
    } while (this.pendingLinks.has(token)) // 防极小概率碰撞

    const now = Date.now()
    this.pendingLinks.set(token, {
      token,
      userId,
      createdAt: now,
      expiresAt: now + TOKEN_TTL_MS,
    })

    return token
  }

  /**
   * 消费绑定 token：把当前平台身份合并到 token 对应的 userId。
   * 成功后 token 立即失效（一次性使用）。
   *
   * @returns 成功返回合并后的 userId，失败（token 不存在/过期）返回 null
   */
  async consumeLinkToken(
    token: string,
    platform: string,
    platformUserId: string,
  ): Promise<string | null> {
    this.cleanupExpiredTokens()

    const pending = this.pendingLinks.get(token.toUpperCase())
    if (!pending) return null

    this.pendingLinks.delete(token.toUpperCase()) // 一次性使用

    // 合并身份：把当前平台 binding 挂到 token 对应的 userId 下
    await this.linkPlatform(pending.userId, platform, platformUserId)

    return pending.userId
  }

  private cleanupExpiredTokens(): void {
    const now = Date.now()
    for (const [token, link] of this.pendingLinks) {
      if (link.expiresAt < now) {
        this.pendingLinks.delete(token)
      }
    }
  }
}
