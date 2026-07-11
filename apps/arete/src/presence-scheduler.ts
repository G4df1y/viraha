import { DurableScheduler, type SchedulerRunResult } from "@viraha/runtime"

export interface PresenceCheckService {
  checkUser(userId: string): Promise<void>
}

export interface ScheduledPresenceCheckOptions {
  scheduler: DurableScheduler
  listActiveUsers: () => Promise<string[]>
  presence: PresenceCheckService
  /**
   * Cooldown window: a user will not receive a second presence-check enqueue
   * within this many milliseconds of a previous non-failed one. Defaults to the
   * scheduler's run interval so a single tick never double-enqueues for a user.
   */
  cooldownMs?: number
}

/**
 * Enqueue a presence-check for every active user (with per-user cooldown dedup),
 * then run all due presence-check jobs in one tick.
 */
export async function runScheduledPresenceChecks(
  options: ScheduledPresenceCheckOptions,
): Promise<SchedulerRunResult> {
  const userIds = [...new Set(await options.listActiveUsers())]
  const runAt = new Date()
  const cooldownMs = options.cooldownMs ?? 0

  for (const userId of userIds) {
    if (cooldownMs > 0) {
      await options.scheduler.enqueueWithCooldown(
        { userId, type: "presence-check", runAt },
        cooldownMs,
      )
    } else {
      await options.scheduler.enqueue({ userId, type: "presence-check", runAt })
    }
  }

  return options.scheduler.runDue(
    job => options.presence.checkUser(job.userId),
    userIds.length,
    runAt,
    "presence-check",
  )
}
