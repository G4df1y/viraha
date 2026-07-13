import type { ToolDefinition } from "@viraha/provider";
import {
  defineCapability,
  evaluateCapabilityAccess,
  type CapabilityGrant,
  type CapabilityGrantScope,
  type CapabilityManifest,
  type CapabilityObservation,
  type Clock,
  type Instant,
} from "@viraha/companion-core";

export interface CapabilityResult {
  content: string;
  data?: Record<string, unknown>;
  sideEffects?: string[];
}

export interface CapabilityInvocationContext {
  userId: string;
  surfaceId: string;
  correlationId: string;
  now: Instant;
}

export type CapabilityHandler = (
  input: Record<string, unknown>,
  context: CapabilityInvocationContext,
) => Promise<CapabilityResult>;

export interface CapabilityGrantStore {
  list(userId: string, capabilityId: string): Promise<CapabilityGrant[]>;
  save(grant: CapabilityGrant): Promise<void>;
  revoke(input: {
    capabilityId: string;
    permissionId: string;
    userId: string;
    revokedAt: Instant;
  }): Promise<void>;
  consume(grantIds: string[]): Promise<void>;
}

export interface CapabilityObservationSink {
  record(observation: CapabilityObservation): Promise<void>;
}

function isActiveAt(grant: CapabilityGrant, now: Instant): boolean {
  return (
    grant.revokedAt === undefined &&
    grant.grantedAt.epochMs <= now.epochMs &&
    (grant.expiresAt === undefined || grant.expiresAt.epochMs > now.epochMs) &&
    (grant.scope === "always" || (grant.remainingUses ?? 1) > 0)
  );
}

export class InMemoryCapabilityGrantStore implements CapabilityGrantStore {
  private readonly grants = new Map<string, CapabilityGrant>();

  async list(userId: string, capabilityId: string): Promise<CapabilityGrant[]> {
    return [...this.grants.values()].filter(
      (grant) =>
        grant.userId === userId && grant.capabilityId === capabilityId,
    );
  }

  async save(grant: CapabilityGrant): Promise<void> {
    this.grants.set(grant.id, grant);
  }

  async revoke(input: {
    capabilityId: string;
    permissionId: string;
    userId: string;
    revokedAt: Instant;
  }): Promise<void> {
    for (const [id, grant] of this.grants) {
      if (
        grant.capabilityId === input.capabilityId &&
        grant.permissionId === input.permissionId &&
        grant.userId === input.userId &&
        isActiveAt(grant, input.revokedAt)
      ) {
        this.grants.set(id, { ...grant, revokedAt: input.revokedAt });
      }
    }
  }

  async consume(grantIds: string[]): Promise<void> {
    for (const id of grantIds) {
      const grant = this.grants.get(id);

      if (grant?.scope === "once") {
        this.grants.set(id, { ...grant, remainingUses: 0 });
      }
    }
  }
}

export class InMemoryCapabilityObservationSink
  implements CapabilityObservationSink
{
  readonly items: CapabilityObservation[] = [];

  async record(observation: CapabilityObservation): Promise<void> {
    this.items.push(observation);
  }
}

export class CapabilityDeniedError extends Error {
  readonly capabilityId: string;
  readonly missingPermissionIds: string[];

  constructor(
    capabilityId: string,
    missingPermissionIds: string[],
    reason: string,
  ) {
    super(reason);
    this.name = "CapabilityDeniedError";
    this.capabilityId = capabilityId;
    this.missingPermissionIds = missingPermissionIds;
  }
}

interface InstalledCapability {
  manifest: CapabilityManifest;
  handler: CapabilityHandler;
  toolName: string;
}

export class CapabilityRuntime {
  private readonly installed = new Map<string, InstalledCapability>();
  private readonly capabilityIdsByToolName = new Map<string, string>();
  private idCounter = 0;

  constructor(
    private readonly ports: {
      clock: Clock;
      grants: CapabilityGrantStore;
      observations: CapabilityObservationSink;
    },
  ) {}

  install(manifestInput: CapabilityManifest, handler: CapabilityHandler): void {
    const manifest = defineCapability(manifestInput);

    if (this.installed.has(manifest.id)) {
      throw new Error(`Capability ${manifest.id} is already installed`);
    }

    const toolName = `cap_${manifest.id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

    if (this.capabilityIdsByToolName.has(toolName)) {
      throw new Error(`Capability tool name collision: ${toolName}`);
    }

    this.installed.set(manifest.id, { manifest, handler, toolName });
    this.capabilityIdsByToolName.set(toolName, manifest.id);
  }

  list(): CapabilityManifest[] {
    return [...this.installed.values()].map(({ manifest }) => manifest);
  }

  toolDefinitions(): ToolDefinition[] {
    return [...this.installed.values()].map(({ manifest, toolName }) => ({
      name: toolName,
      description: manifest.description,
      inputSchema: manifest.inputSchema,
    }));
  }

  capabilityIdForTool(toolName: string): string | undefined {
    return this.capabilityIdsByToolName.get(toolName);
  }

  async grant(input: {
    capabilityId: string;
    permissionId: string;
    userId: string;
    scope: CapabilityGrantScope;
    expiresAt?: Instant;
  }): Promise<CapabilityGrant> {
    const installed = this.requireInstalled(input.capabilityId);

    if (
      !installed.manifest.permissions.some(
        (permission) => permission.id === input.permissionId,
      )
    ) {
      throw new Error(
        `Capability ${input.capabilityId} does not declare permission ${input.permissionId}`,
      );
    }

    const grantedAt = this.ports.clock.now();
    const base = {
      id: this.nextId("capability-grant", grantedAt),
      capabilityId: input.capabilityId,
      permissionId: input.permissionId,
      userId: input.userId,
      grantedAt,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    };
    const grant: CapabilityGrant =
      input.scope === "once"
        ? { ...base, scope: "once", remainingUses: 1 }
        : { ...base, scope: "always" };

    await this.ports.grants.save(grant);
    return grant;
  }

  async revoke(input: {
    capabilityId: string;
    permissionId: string;
    userId: string;
  }): Promise<void> {
    await this.ports.grants.revoke({
      ...input,
      revokedAt: this.ports.clock.now(),
    });
  }

  async invoke(request: {
    capabilityId: string;
    input: Record<string, unknown>;
    userId: string;
    surfaceId: string;
    correlationId: string;
  }): Promise<CapabilityResult> {
    const installed = this.requireInstalled(request.capabilityId);
    const startedAt = this.ports.clock.now();
    const monotonicStart = this.ports.clock.monotonicMs();
    const grants = await this.ports.grants.list(
      request.userId,
      request.capabilityId,
    );
    const decision = evaluateCapabilityAccess(
      installed.manifest,
      grants,
      request.userId,
      startedAt,
    );

    if (!decision.allowed) {
      const completedAt = this.ports.clock.now();
      await this.ports.observations.record({
        id: this.nextId("capability-observation", completedAt),
        capabilityId: request.capabilityId,
        userId: request.userId,
        surfaceId: request.surfaceId,
        correlationId: request.correlationId,
        outcome: "denied",
        startedAt,
        completedAt,
        durationMs: this.ports.clock.monotonicMs() - monotonicStart,
        grantIds: [],
        sideEffects: [],
        reason: decision.reason,
      });
      throw new CapabilityDeniedError(
        request.capabilityId,
        decision.missingPermissionIds,
        decision.reason,
      );
    }

    await this.ports.grants.consume(decision.grantIds);

    let result: CapabilityResult;
    try {
      result = await installed.handler(request.input, {
        userId: request.userId,
        surfaceId: request.surfaceId,
        correlationId: request.correlationId,
        now: startedAt,
      });
    } catch (error) {
      const completedAt = this.ports.clock.now();
      await this.ports.observations.record({
        id: this.nextId("capability-observation", completedAt),
        capabilityId: request.capabilityId,
        userId: request.userId,
        surfaceId: request.surfaceId,
        correlationId: request.correlationId,
        outcome: "failed",
        startedAt,
        completedAt,
        durationMs: this.ports.clock.monotonicMs() - monotonicStart,
        grantIds: decision.grantIds,
        sideEffects: [],
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const completedAt = this.ports.clock.now();
    await this.ports.observations.record({
      id: this.nextId("capability-observation", completedAt),
      capabilityId: request.capabilityId,
      userId: request.userId,
      surfaceId: request.surfaceId,
      correlationId: request.correlationId,
      outcome: "completed",
      startedAt,
      completedAt,
      durationMs: this.ports.clock.monotonicMs() - monotonicStart,
      grantIds: decision.grantIds,
      sideEffects: result.sideEffects ?? [],
    });
    return result;
  }

  private requireInstalled(capabilityId: string): InstalledCapability {
    const installed = this.installed.get(capabilityId);

    if (installed === undefined) {
      throw new Error(`Capability ${capabilityId} is not installed`);
    }

    return installed;
  }

  private nextId(prefix: string, now: Instant): string {
    this.idCounter += 1;
    return `${prefix}-${now.epochMs}-${this.idCounter}`;
  }
}
