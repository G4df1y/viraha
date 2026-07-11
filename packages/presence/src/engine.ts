import cron from "node-cron"
import { ConditionEvaluator, type TriggerResult } from "./conditions.js"
import { getProactiveMessage } from "./templates.js"
import { getDb } from "@viraha/db"
import { events } from "@viraha/db"
import crypto from "crypto"

/**
 * 主动消息发送器。
 * sender 必须根据 userId 把消息发到该用户绑定的平台（可能多个）——这是跨平台一致体验的关键。
 */
export type ProactiveSender = (message: string, trigger: TriggerResult, userId: string) => Promise<void>

export class PresenceEngine {
  private evaluator = new ConditionEvaluator()
  private jobs = new Map<string, cron.ScheduledTask>()
  private sender?: ProactiveSender
  private refreshJob?: cron.ScheduledTask

  setSender(sender: ProactiveSender) {
    this.sender = sender
  }

  start(userId: string, cronExpression = "0 */2 * * *") {
    if (this.jobs.has(userId)) return

    const job = cron.schedule(cronExpression, async () => {
      await this.checkUser(userId)
    })

    this.jobs.set(userId, job)
  }

  /**
   * 按当前所有活跃用户启动 presence。
   * 会定时（默认每 10 分钟）刷新 jobs 列表，让新绑定的用户也能收到主动消息。
   *
   * @param listActiveUsers 返回当前所有活跃 userId 的回调（通常从 ChannelRouter.listActiveUsers 取）
   * @param checkCron 评估每个用户的频率（默认每 2 小时）
   * @param refreshCron 刷新用户列表的频率（默认每 10 分钟）
   */
  startAllActive(
    listActiveUsers: () => Promise<string[]>,
    checkCron = "0 */2 * * *",
    refreshCron = "*/10 * * * *",
  ) {
    // 立即拉一次用户列表，启动各自的 job
    const refresh = async () => {
      try {
        const userIds = await listActiveUsers()
        for (const userId of userIds) {
          this.start(userId, checkCron)
        }
      } catch (err) {
        console.error("[Presence] refresh active users error:", err)
      }
    }

    void refresh()
    this.refreshJob = cron.schedule(refreshCron, refresh)
  }

  stop(userId: string) {
    const job = this.jobs.get(userId)
    if (job) {
      job.stop()
      this.jobs.delete(userId)
    }
  }

  stopAll() {
    for (const job of this.jobs.values()) job.stop()
    this.jobs.clear()
    this.refreshJob?.stop()
    this.refreshJob = undefined
  }

  async checkUser(userId: string): Promise<void> {
    try {
      const pending = await this.evaluator.getPendingProactiveEvent(userId)
      if (pending) {
        if (!this.sender) return
        try {
          await this.sender(pending.message, pending.trigger, userId)
          await this.evaluator.markDelivered(pending.eventId)
        } catch (err) {
          console.error("[Presence] retry delivery failed, keeping event pending:", err)
        }
        return
      }

      const trigger = await this.evaluator.evaluateAll(userId)
      if (!trigger) return

      const message = getProactiveMessage(trigger.type, trigger.data)
      if (!message) return

      const eventId = await this.persistProactiveEvent(userId, trigger, message)

      if (this.sender) {
        try {
          await this.sender(message, trigger, userId)
          await this.evaluator.markDelivered(eventId)
        } catch (err) {
          console.error("[Presence] delivery failed, keeping event pending:", err)
        }
      }
    } catch (err) {
      console.error("[Presence] check error:", err)
    }
  }

  async getPending(userId: string): Promise<TriggerResult | null> {
    return this.evaluator.getPendingProactive(userId)
  }

  private async persistProactiveEvent(userId: string, trigger: TriggerResult, message: string): Promise<string> {
    const db = getDb()
    const eventId = crypto.randomUUID()
    await db.insert(events).values({
      id: eventId,
      userId,
      eventType: "proactive",
      title: trigger.type,
      description: message,
      occurredAt: new Date().toISOString(),
      metadata: JSON.stringify({ ...trigger.data, delivered: false }),
      createdAt: new Date().toISOString(),
    })
    return eventId
  }
}


