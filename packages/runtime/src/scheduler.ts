import crypto from "crypto"
import { getSqliteClient } from "@viraha/db"

export type DurableJobStatus = "queued" | "running" | "completed" | "failed"

export interface DurableJob {
  id: string
  userId: string
  type: string
  payload: Record<string, unknown>
  runAt: string
  status: DurableJobStatus
  attempts: number
  lastError: string | null
  lockedAt: string | null
  completedAt: string | null
  createdAt: string
}

export interface EnqueueJobInput {
  id?: string
  userId: string
  type: string
  payload?: Record<string, unknown>
  runAt: Date | string
}

export interface SchedulerRunResult {
  completed: number
  failed: number
}

export interface DurableSchedulerOptions {
  /** How long a claimed job may run before another worker may reclaim it. */
  leaseMs?: number
  /** Max run attempts before a job is permanently marked failed. */
  maxAttempts?: number
  /** Base delay for exponential backoff between retries (ms). */
  backoffBaseMs?: number
  /** Cap for exponential backoff (ms). */
  backoffMaxMs?: number
}

export interface EnqueueWithCooldownResult {
  id: string
  /** true when an existing non-failed job for the same user+type was found within the cooldown window. */
  deduplicated: boolean
}

export interface SchedulerFailureRow {
  id: string
  userId: string
  type: string
  lastError: string | null
  attempts: number
}

export interface SchedulerStats {
  queued: number
  running: number
  completed: number
  failed: number
  recentFailures: SchedulerFailureRow[]
}

export class DurableScheduler {
  private readonly leaseMs: number
  private readonly maxAttempts: number
  private readonly backoffBaseMs: number
  private readonly backoffMaxMs: number

  constructor(options: DurableSchedulerOptions = {}) {
    this.leaseMs = options.leaseMs ?? 60_000
    this.maxAttempts = options.maxAttempts ?? 5
    this.backoffBaseMs = options.backoffBaseMs ?? 30_000
    this.backoffMaxMs = options.backoffMaxMs ?? 3_600_000
  }

  async enqueue(input: EnqueueJobInput): Promise<string> {
    const id = input.id ?? `job_${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const runAt = input.runAt instanceof Date ? input.runAt.toISOString() : input.runAt
    await getSqliteClient().execute({
      sql: `INSERT INTO scheduled_jobs
        (id, user_id, type, payload, run_at, status, attempts, created_at)
        VALUES (?, ?, ?, ?, ?, 'queued', 0, ?)`,
      args: [id, input.userId, input.type, JSON.stringify(input.payload ?? {}), runAt, now],
    })
    return id
  }

  /**
   * Enqueue only if no non-failed job of the same user+type exists within the
   * cooldown window. Prevents duplicate proactive messages per user. Returns the
   * existing job id (deduplicated: true) when suppressed.
   */
  async enqueueWithCooldown(
    input: EnqueueJobInput,
    cooldownMs: number,
    now: Date = new Date(),
  ): Promise<EnqueueWithCooldownResult> {
    const since = new Date(now.getTime() - cooldownMs).toISOString()
    const existing = await getSqliteClient().execute({
      sql: `SELECT id FROM scheduled_jobs
        WHERE user_id = ? AND type = ? AND status != 'failed' AND created_at >= ?
        ORDER BY created_at DESC
        LIMIT 1`,
      args: [input.userId, input.type, since],
    })
    if (existing.rows.length > 0) {
      return { id: String(existing.rows[0].id), deduplicated: true }
    }
    return { id: await this.enqueue(input), deduplicated: false }
  }

  async claim(limit = 1, now = new Date(), type?: string): Promise<DurableJob[]> {
    const client = getSqliteClient()
    const staleBefore = new Date(now.getTime() - this.leaseMs).toISOString()
    await client.execute({
      sql: `UPDATE scheduled_jobs
        SET status = 'queued', locked_at = NULL
        WHERE status = 'running' AND locked_at IS NOT NULL AND locked_at < ?`,
      args: [staleBefore],
    })

    const claimed: DurableJob[] = []
    for (let i = 0; i < limit; i++) {
      const lockedAt = now.toISOString()
      const result = await client.execute({
        sql: `UPDATE scheduled_jobs
          SET status = 'running', attempts = attempts + 1, locked_at = ?
          WHERE id = (
            SELECT id FROM scheduled_jobs
            WHERE status = 'queued' AND run_at <= ?
              AND (? IS NULL OR type = ?)
            ORDER BY run_at ASC, created_at ASC
            LIMIT 1
          )
          RETURNING id, user_id, type, payload, run_at, status, attempts,
                    last_error, locked_at, completed_at, created_at`,
        args: [lockedAt, now.toISOString(), type ?? null, type ?? null],
      })
      if (result.rows.length === 0) break
      claimed.push(this.parseRow(result.rows[0]))
    }
    return claimed
  }

  async complete(id: string, completedAt = new Date()): Promise<void> {
    await getSqliteClient().execute({
      sql: `UPDATE scheduled_jobs
        SET status = 'completed', completed_at = ?, locked_at = NULL
        WHERE id = ?`,
      args: [completedAt.toISOString(), id],
    })
  }

  async fail(id: string, error: string, retryAt?: Date): Promise<void> {
    const retry = retryAt ? retryAt.toISOString() : null
    await getSqliteClient().execute({
      sql: `UPDATE scheduled_jobs
        SET status = ?, run_at = COALESCE(?, run_at), last_error = ?, locked_at = NULL
        WHERE id = ?`,
      args: [retryAt ? "queued" : "failed", retry, error, id],
    })
  }

  async getJob(id: string): Promise<DurableJob | null> {
    const result = await getSqliteClient().execute({
      sql: `SELECT id, user_id, type, payload, run_at, status, attempts,
                   last_error, locked_at, completed_at, created_at
            FROM scheduled_jobs WHERE id = ?`,
      args: [id],
    })
    if (result.rows.length === 0) return null
    return this.parseRow(result.rows[0])
  }

  async runDue(
    handler: (job: DurableJob) => Promise<void>,
    limit = 10,
    now = new Date(),
    type?: string,
  ): Promise<SchedulerRunResult> {
    const jobs = await this.claim(limit, now, type)
    let completed = 0
    let failed = 0

    for (const job of jobs) {
      try {
        await handler(job)
        await this.complete(job.id, now)
        completed++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (job.attempts < this.maxAttempts) {
          const backoff = Math.min(
            this.backoffBaseMs * 2 ** (job.attempts - 1),
            this.backoffMaxMs,
          )
          await this.fail(job.id, msg, new Date(now.getTime() + backoff))
        } else {
          await this.fail(job.id, msg)
        }
        failed++
      }
    }

    return { completed, failed }
  }

  /** Counts by status plus the most recent permanently-failed jobs (for the Trace Cockpit). */
  async getStats(): Promise<SchedulerStats> {
    const client = getSqliteClient()
    const counts = await client.execute({
      sql: `SELECT status, COUNT(*) AS n FROM scheduled_jobs GROUP BY status`,
      args: [],
    })
    const stats: SchedulerStats = {
      queued: 0, running: 0, completed: 0, failed: 0, recentFailures: [],
    }
    for (const row of counts.rows) {
      const status = String(row.status) as DurableJobStatus
      const n = Number(row.n)
      if (status === "queued") stats.queued = n
      else if (status === "running") stats.running = n
      else if (status === "completed") stats.completed = n
      else if (status === "failed") stats.failed = n
    }
    const failures = await client.execute({
      sql: `SELECT id, user_id, type, last_error, attempts
            FROM scheduled_jobs
            WHERE status = 'failed'
            ORDER BY created_at DESC
            LIMIT 10`,
      args: [],
    })
    stats.recentFailures = failures.rows.map(row => ({
      id: String(row.id),
      userId: String(row.user_id),
      type: String(row.type),
      lastError: row.last_error == null ? null : String(row.last_error),
      attempts: Number(row.attempts),
    }))
    return stats
  }

  private parseRow(row: Record<string, unknown>): DurableJob {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      type: String(row.type),
      payload: JSON.parse(String(row.payload ?? "{}")) as Record<string, unknown>,
      runAt: String(row.run_at),
      status: String(row.status) as DurableJobStatus,
      attempts: Number(row.attempts),
      lastError: row.last_error == null ? null : String(row.last_error),
      lockedAt: row.locked_at == null ? null : String(row.locked_at),
      completedAt: row.completed_at == null ? null : String(row.completed_at),
      createdAt: String(row.created_at),
    }
  }
}
