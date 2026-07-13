import { ManualClock, type CapabilityManifest } from "@viraha/companion-core";
import { describe, expect, it } from "vitest";

import {
  CapabilityDeniedError,
  CapabilityRuntime,
  InMemoryCapabilityGrantStore,
  InMemoryCapabilityObservationSink,
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
