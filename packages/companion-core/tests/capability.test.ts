import { describe, expect, it } from "vitest";

import {
  createInstant,
  defineCapability,
  evaluateCapabilityAccess,
  type CapabilityGrant,
  type CapabilityManifest,
} from "../src/index.js";

const grantedAt = createInstant("2026-07-13T00:00:00.000Z", "test");
const now = createInstant("2026-07-13T01:00:00.000Z", "test");

const manifest: CapabilityManifest = {
  schemaVersion: 1,
  id: "community.echo",
  version: "1.0.0",
  name: "Echo",
  description: "Echoes selected conversation text.",
  author: "Viraha Community",
  license: "Apache-2.0",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  permissions: [
    {
      id: "conversation.read",
      kind: "read",
      reason: "Read the text selected by the user.",
      required: true,
      dataCategories: ["conversation.selected_text"],
    },
    {
      id: "response.act",
      kind: "act",
      reason: "Return the echoed response.",
      required: true,
    },
    {
      id: "memory.remember",
      kind: "remember",
      reason: "Remember the user's echo preferences.",
      required: true,
    },
    {
      id: "background.run",
      kind: "background",
      reason: "Run an approved echo in the background.",
      required: true,
    },
  ],
  sideEffect: "none",
  risk: "low",
};

function grant(
  permissionId: string,
  overrides: Partial<CapabilityGrant> = {},
): CapabilityGrant {
  return {
    id: `grant-${permissionId}`,
    capabilityId: manifest.id,
    permissionId,
    userId: "user-1",
    scope: "always",
    grantedAt,
    ...overrides,
  };
}

describe("Capability contracts", () => {
  it("rejects duplicate permission ids", () => {
    expect(() =>
      defineCapability({
        ...manifest,
        permissions: [manifest.permissions[0], manifest.permissions[0]],
      }),
    ).toThrow("Capability permission ids must be unique");
  });

  it("rejects a malformed capability id", () => {
    expect(() =>
      defineCapability({ ...manifest, id: "Community/Echo" }),
    ).toThrow("Capability id must be lowercase and namespace-safe");
  });

  it("rejects a malformed capability version", () => {
    expect(() => defineCapability({ ...manifest, version: "1.0" })).toThrow(
      "Capability version must use major.minor.patch",
    );
  });

  it("rejects a blank permission reason", () => {
    expect(() =>
      defineCapability({
        ...manifest,
        permissions: [
          { ...manifest.permissions[0], reason: "   " },
          ...manifest.permissions.slice(1),
        ],
      }),
    ).toThrow("Capability permission conversation.read needs a reason");
  });

  it("reports every missing required permission in manifest order", () => {
    expect(
      evaluateCapabilityAccess(
        manifest,
        [grant("conversation.read")],
        "user-1",
        now,
      ),
    ).toEqual({
      allowed: false,
      missingPermissionIds: [
        "response.act",
        "memory.remember",
        "background.run",
      ],
      reason:
        "Missing required Capability permissions: response.act, memory.remember, background.run",
    });
  });

  it.each([
    ["revoked", { revokedAt: grantedAt }],
    ["expired at now", { expiresAt: now }],
    [
      "expired before now",
      { expiresAt: createInstant("2026-07-13T00:59:59.999Z", "test") },
    ],
    ["exhausted one-time", { scope: "once" as const, remainingUses: 0 }],
  ])("treats a %s grant as inactive", (_, overrides) => {
    expect(
      evaluateCapabilityAccess(
        manifest,
        [
          grant("conversation.read", overrides),
          grant("response.act"),
          grant("memory.remember"),
          grant("background.run"),
        ],
        "user-1",
        now,
      ),
    ).toEqual({
      allowed: false,
      missingPermissionIds: ["conversation.read"],
      reason: "Missing required Capability permissions: conversation.read",
    });
  });

  it("allows active grants and returns their ids in manifest order", () => {
    expect(
      evaluateCapabilityAccess(
        manifest,
        [
          grant("background.run"),
          grant("memory.remember"),
          grant("conversation.read"),
          grant("response.act"),
        ],
        "user-1",
        now,
      ),
    ).toEqual({
      allowed: true,
      grantIds: [
        "grant-conversation.read",
        "grant-response.act",
        "grant-memory.remember",
        "grant-background.run",
      ],
    });
  });

  it.each([
    ["another user", { userId: "user-2" }],
    ["another capability", { capabilityId: "community.other" }],
  ])("does not use a grant belonging to %s", (_, overrides) => {
    expect(
      evaluateCapabilityAccess(
        manifest,
        [
          grant("conversation.read", overrides),
          grant("response.act"),
          grant("memory.remember"),
          grant("background.run"),
        ],
        "user-1",
        now,
      ),
    ).toEqual({
      allowed: false,
      missingPermissionIds: ["conversation.read"],
      reason: "Missing required Capability permissions: conversation.read",
    });
  });
});
