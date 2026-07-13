import {
  ManualClock,
  type CapabilityAccessDecision,
  type CapabilityGrant,
  type CapabilityManifest,
  type CapabilityObservation,
  type Instant,
} from "@viraha/companion-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CapabilityDeniedError,
  CapabilityRuntime,
  InMemoryCapabilityGrantStore,
  InMemoryCapabilityObservationSink,
  type CapabilityGrantStore,
  type CapabilityObservationSink,
} from "../src/capability-runtime.js";

const manifest: CapabilityManifest = {
  schemaVersion: 1,
  id: "community.echo",
  version: "1.0.0",
  name: "Echo",
  description: "Echoes selected conversation text.",
  author: "Viraha Community",
  license: "Apache-2.0",
  inputSchema: {
    type: "object",
    properties: { selectedText: { type: "string" } },
    required: ["selectedText"],
  },
  outputSchema: { type: "object" },
  permissions: [
    {
      id: "response.act",
      kind: "act",
      reason: "Return the echoed response.",
      required: true,
    },
  ],
  sideEffect: "none",
  risk: "low",
};

function createRuntime() {
  const clock = new ManualClock("2026-07-13T00:00:00.000Z");
  const grants = new InMemoryCapabilityGrantStore();
  const observations = new InMemoryCapabilityObservationSink();
  const runtime = new CapabilityRuntime({ clock, grants, observations });

  runtime.install(manifest, async (input) => ({
    content: String(input.selectedText),
    data: { echoed: true },
    sideEffects: [],
  }));

  return { clock, grants, observations, runtime };
}

function invocation(capabilityId = manifest.id) {
  return {
    capabilityId,
    input: { selectedText: "hello" },
    userId: "user-1",
    surfaceId: "desktop",
    correlationId: "correlation-1",
  };
}

class RejectingObservationSink implements CapabilityObservationSink {
  readonly attempts: CapabilityObservation[] = [];

  constructor(readonly error: Error) {}

  async record(observation: CapabilityObservation): Promise<void> {
    this.attempts.push(structuredClone(observation));
    throw this.error;
  }
}

class RejectingClaimGrantStore implements CapabilityGrantStore {
  constructor(readonly error: Error) {}

  async list(): Promise<CapabilityGrant[]> {
    throw this.error;
  }

  async save(): Promise<void> {}

  async revoke(): Promise<void> {}

  async claim(
    _manifest: CapabilityManifest,
    _userId: string,
    _now: Instant,
  ): Promise<CapabilityAccessDecision> {
    throw this.error;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CapabilityRuntime", () => {
  it("does not grant permissions when a capability is installed", async () => {
    const { observations, runtime } = createRuntime();

    await expect(runtime.invoke(invocation())).rejects.toMatchObject({
      name: "CapabilityDeniedError",
      capabilityId: manifest.id,
      missingPermissionIds: ["response.act"],
    });
    expect(observations.items).toHaveLength(1);
    expect(observations.items[0]).toMatchObject({
      capabilityId: manifest.id,
      userId: "user-1",
      surfaceId: "desktop",
      correlationId: "correlation-1",
      outcome: "denied",
      durationMs: 0,
      grantIds: [],
      sideEffects: [],
      reason: "Missing required Capability permissions: response.act",
    });
  });

  it("grants, invokes, observes, and revokes a capability", async () => {
    const { clock, observations, runtime } = createRuntime();
    const grant = await runtime.grant({
      capabilityId: manifest.id,
      permissionId: "response.act",
      userId: "user-1",
      scope: "always",
    });
    expect(grant).not.toHaveProperty("remainingUses");

    clock.advance(10);
    const result = await runtime.invoke(invocation());

    expect(result).toEqual({
      content: "hello",
      data: { echoed: true },
      sideEffects: [],
    });
    expect(observations.items[0]).toMatchObject({
      capabilityId: manifest.id,
      userId: "user-1",
      surfaceId: "desktop",
      correlationId: "correlation-1",
      outcome: "completed",
      startedAt: clock.now(),
      completedAt: clock.now(),
      durationMs: 0,
      grantIds: [grant.id],
      sideEffects: [],
    });

    await runtime.revoke({
      capabilityId: manifest.id,
      permissionId: "response.act",
      userId: "user-1",
    });
    await expect(runtime.invoke(invocation())).rejects.toBeInstanceOf(
      CapabilityDeniedError,
    );
    expect(observations.items[1]).toMatchObject({
      capabilityId: manifest.id,
      outcome: "denied",
      grantIds: [],
      reason: "Missing required Capability permissions: response.act",
    });
  });

  it("records handler failures and consumes one-time consent", async () => {
    const { observations, runtime } = createRuntime();
    const failureManifest = {
      ...manifest,
      id: "community.fail",
      name: "Fail",
    };
    runtime.install(failureManifest, async () => {
      throw new Error("handler failed");
    });
    const grant = await runtime.grant({
      capabilityId: failureManifest.id,
      permissionId: "response.act",
      userId: "user-1",
      scope: "once",
    });

    await expect(
      runtime.invoke(invocation(failureManifest.id)),
    ).rejects.toThrow("handler failed");
    expect(observations.items[0]).toMatchObject({
      capabilityId: failureManifest.id,
      outcome: "failed",
      grantIds: [grant.id],
      sideEffects: [],
      reason: "handler failed",
    });

    await expect(
      runtime.invoke(invocation(failureManifest.id)),
    ).rejects.toBeInstanceOf(CapabilityDeniedError);
    expect(observations.items[1]).toMatchObject({
      capabilityId: failureManifest.id,
      outcome: "denied",
      grantIds: [],
    });
  });

  it("consumes one-time consent after a successful invocation", async () => {
    const { observations, runtime } = createRuntime();
    const grant = await runtime.grant({
      capabilityId: manifest.id,
      permissionId: "response.act",
      userId: "user-1",
      scope: "once",
    });
    expect(grant).toMatchObject({ scope: "once", remainingUses: 1 });

    await expect(runtime.invoke(invocation())).resolves.toMatchObject({
      content: "hello",
    });
    await expect(runtime.invoke(invocation())).rejects.toBeInstanceOf(
      CapabilityDeniedError,
    );
    expect(observations.items.map((item) => item.outcome)).toEqual([
      "completed",
      "denied",
    ]);
  });

  it("atomically allows only one concurrent invocation for one-time consent", async () => {
    const clock = new ManualClock("2026-07-13T00:00:00.000Z");
    const grants = new InMemoryCapabilityGrantStore();
    const observations = new InMemoryCapabilityObservationSink();
    const runtime = new CapabilityRuntime({ clock, grants, observations });
    let releaseHandler!: () => void;
    const handlerBarrier = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    let handlerExecutions = 0;
    runtime.install(manifest, async () => {
      handlerExecutions += 1;
      await handlerBarrier;
      return { content: "hello" };
    });
    await runtime.grant({
      capabilityId: manifest.id,
      permissionId: "response.act",
      userId: "user-1",
      scope: "once",
    });

    const attempts = [
      runtime.invoke(invocation()),
      runtime.invoke({ ...invocation(), correlationId: "correlation-2" }),
    ];
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    releaseHandler();
    const results = await Promise.allSettled(attempts);

    expect(handlerExecutions).toBe(1);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.any(CapabilityDeniedError),
    });
    expect(observations.items.map((item) => item.outcome).sort()).toEqual([
      "completed",
      "denied",
    ]);
  });

  it("keeps capability denial primary when observation recording fails", async () => {
    const sinkError = new Error("observation unavailable");
    const observations = new RejectingObservationSink(sinkError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const runtime = new CapabilityRuntime({
      clock: new ManualClock("2026-07-13T00:00:00.000Z"),
      grants: new InMemoryCapabilityGrantStore(),
      observations,
    });
    runtime.install(manifest, async () => ({ content: "unused" }));

    await expect(runtime.invoke(invocation())).rejects.toBeInstanceOf(
      CapabilityDeniedError,
    );
    expect(observations.attempts[0]).toMatchObject({ outcome: "denied" });
    expect(errorSpy).toHaveBeenCalledWith(
      "[CapabilityRuntime] Failed to record observation",
      sinkError,
    );
  });

  it("keeps the exact handler error primary when observation recording fails", async () => {
    const handlerError = new Error("handler failed exactly");
    const sinkError = new Error("observation unavailable");
    const observations = new RejectingObservationSink(sinkError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const grants = new InMemoryCapabilityGrantStore();
    const runtime = new CapabilityRuntime({
      clock: new ManualClock("2026-07-13T00:00:00.000Z"),
      grants,
      observations,
    });
    runtime.install(manifest, async () => {
      throw handlerError;
    });
    await runtime.grant({
      capabilityId: manifest.id,
      permissionId: "response.act",
      userId: "user-1",
      scope: "always",
    });

    const caught = await runtime.invoke(invocation()).catch((error) => error);

    expect(caught).toBe(handlerError);
    expect(observations.attempts[0]).toMatchObject({ outcome: "failed" });
    expect(errorSpy).toHaveBeenCalledWith(
      "[CapabilityRuntime] Failed to record observation",
      sinkError,
    );
  });

  it("keeps a completed handler result when observation recording fails", async () => {
    const sinkError = new Error("observation unavailable");
    const observations = new RejectingObservationSink(sinkError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const grants = new InMemoryCapabilityGrantStore();
    const runtime = new CapabilityRuntime({
      clock: new ManualClock("2026-07-13T00:00:00.000Z"),
      grants,
      observations,
    });
    const handlerResult = { content: "completed", sideEffects: ["sent"] };
    runtime.install(manifest, async () => handlerResult);
    await runtime.grant({
      capabilityId: manifest.id,
      permissionId: "response.act",
      userId: "user-1",
      scope: "always",
    });

    await expect(runtime.invoke(invocation())).resolves.toBe(handlerResult);
    expect(observations.attempts[0]).toMatchObject({ outcome: "completed" });
    expect(errorSpy).toHaveBeenCalledWith(
      "[CapabilityRuntime] Failed to record observation",
      sinkError,
    );
  });

  it("records a claim failure without replacing the grant-store error", async () => {
    const claimError = new Error("grant store unavailable");
    const sinkError = new Error("observation unavailable");
    const grants = new RejectingClaimGrantStore(claimError);
    const observations = new RejectingObservationSink(sinkError);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const runtime = new CapabilityRuntime({
      clock: new ManualClock("2026-07-13T00:00:00.000Z"),
      grants,
      observations,
    });
    let handlerRan = false;
    runtime.install(manifest, async () => {
      handlerRan = true;
      return { content: "unused" };
    });

    const caught = await runtime.invoke(invocation()).catch((error) => error);

    expect(caught).toBe(claimError);
    expect(handlerRan).toBe(false);
    expect(observations.attempts[0]).toMatchObject({
      capabilityId: manifest.id,
      outcome: "failed",
      grantIds: [],
      sideEffects: [],
      reason: "grant store unavailable",
    });
  });

  it("keeps installed manifests and tool definitions isolated from callers", async () => {
    const installedManifest = structuredClone(manifest);
    const clock = new ManualClock("2026-07-13T00:00:00.000Z");
    const runtime = new CapabilityRuntime({
      clock,
      grants: new InMemoryCapabilityGrantStore(),
      observations: new InMemoryCapabilityObservationSink(),
    });
    runtime.install(installedManifest, async () => ({ content: "hello" }));

    installedManifest.permissions.length = 0;
    installedManifest.inputSchema.type = "string";
    expect(runtime.list()[0]?.permissions.map(({ id }) => id)).toEqual([
      "response.act",
    ]);
    expect(runtime.toolDefinitions()[0]?.inputSchema.type).toBe("object");

    const listedManifest = runtime.list()[0]!;
    listedManifest.permissions.length = 0;
    listedManifest.inputSchema.type = "number";
    const toolDefinition = runtime.toolDefinitions()[0]!;
    toolDefinition.inputSchema.type = "boolean";

    expect(runtime.list()[0]?.permissions.map(({ id }) => id)).toEqual([
      "response.act",
    ]);
    expect(runtime.list()[0]?.inputSchema.type).toBe("object");
    expect(runtime.toolDefinitions()[0]?.inputSchema.type).toBe("object");
    await expect(runtime.invoke(invocation())).rejects.toMatchObject({
      missingPermissionIds: ["response.act"],
    });
  });

  it("keeps store authorization isolated from returned grants", async () => {
    const { grants, runtime } = createRuntime();
    const grant = await runtime.grant({
      capabilityId: manifest.id,
      permissionId: "response.act",
      userId: "user-1",
      scope: "once",
    });
    if (grant.scope === "once") {
      grant.remainingUses = 0;
    }
    grant.permissionId = "changed.permission";

    const listedGrants = await grants.list("user-1", manifest.id);
    expect(listedGrants[0]).toMatchObject({
      permissionId: "response.act",
      remainingUses: 1,
    });
    listedGrants[0]!.permissionId = "changed.again";

    await expect(runtime.invoke(invocation())).resolves.toMatchObject({
      content: "hello",
    });
  });

  it("snapshots recorded side effects", async () => {
    const clock = new ManualClock("2026-07-13T00:00:00.000Z");
    const grants = new InMemoryCapabilityGrantStore();
    const observations = new InMemoryCapabilityObservationSink();
    const runtime = new CapabilityRuntime({ clock, grants, observations });
    const handlerResult = {
      content: "completed",
      sideEffects: ["response.sent"],
    };
    runtime.install(manifest, async () => handlerResult);
    await runtime.grant({
      capabilityId: manifest.id,
      permissionId: "response.act",
      userId: "user-1",
      scope: "always",
    });

    await runtime.invoke(invocation());
    handlerResult.sideEffects.push("later.mutation");
    const observationSnapshot = observations.items[0]!;
    observationSnapshot.sideEffects.push("snapshot.mutation");

    expect(observations.items[0]?.sideEffects).toEqual(["response.sent"]);
  });

  it("does not collide grant ids across runtime instances", async () => {
    const clock = new ManualClock("2026-07-13T00:00:00.000Z");
    const grants = new InMemoryCapabilityGrantStore();
    const firstRuntime = new CapabilityRuntime({
      clock,
      grants,
      observations: new InMemoryCapabilityObservationSink(),
    });
    const secondRuntime = new CapabilityRuntime({
      clock,
      grants,
      observations: new InMemoryCapabilityObservationSink(),
    });
    firstRuntime.install(manifest, async () => ({ content: "first" }));
    secondRuntime.install(manifest, async () => ({ content: "second" }));

    const firstGrant = await firstRuntime.grant({
      capabilityId: manifest.id,
      permissionId: "response.act",
      userId: "user-1",
      scope: "always",
    });
    const secondGrant = await secondRuntime.grant({
      capabilityId: manifest.id,
      permissionId: "response.act",
      userId: "user-1",
      scope: "always",
    });

    expect(firstGrant.id).not.toBe(secondGrant.id);
    await expect(grants.list("user-1", manifest.id)).resolves.toHaveLength(2);
  });

  it("validates lifecycle boundaries and exposes provider tool metadata", async () => {
    const { runtime } = createRuntime();

    expect(() => runtime.install(manifest, async () => ({ content: "" }))).toThrow(
      "Capability community.echo is already installed",
    );
    await expect(
      runtime.grant({
        capabilityId: "community.unknown",
        permissionId: "response.act",
        userId: "user-1",
        scope: "always",
      }),
    ).rejects.toThrow("Capability community.unknown is not installed");
    await expect(
      runtime.grant({
        capabilityId: manifest.id,
        permissionId: "memory.remember",
        userId: "user-1",
        scope: "always",
      }),
    ).rejects.toThrow(
      "Capability community.echo does not declare permission memory.remember",
    );

    expect(runtime.list()).toEqual([manifest]);
    expect(runtime.toolDefinitions()).toEqual([
      {
        name: "cap_community_echo",
        description: manifest.description,
        inputSchema: manifest.inputSchema,
      },
    ]);
    expect(runtime.capabilityIdForTool("cap_community_echo")).toBe(
      manifest.id,
    );
    expect(runtime.capabilityIdForTool("missing_tool")).toBeUndefined();
  });
});
