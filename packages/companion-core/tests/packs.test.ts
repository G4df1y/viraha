import { describe, expect, it } from "vitest";

import {
  ARETE_PACK,
  BUILTIN_TEMPLATES,
  evaluatePackAccess,
  type CompanionPackManifest,
  type CompanionPermission,
} from "../src/index.js";

describe("evaluatePackAccess", () => {
  it("allows a 15-year-old to use Arete without guardian approval", () => {
    expect(
      evaluatePackAccess(ARETE_PACK, {
        age: 15,
        guardianApproved: false,
      }),
    ).toEqual({ allowed: true });
  });

  it("requires guardian approval for users under 14", () => {
    expect(
      evaluatePackAccess(ARETE_PACK, {
        age: 13,
        guardianApproved: false,
      }),
    ).toEqual({
      allowed: false,
      reason: "Guardian approval is required for users under 14.",
    });
  });

  it("restricts romance Companions to adults", () => {
    expect(
      evaluatePackAccess(
        {
          ...ARETE_PACK,
          category: "romance",
          minimumAge: 18,
        },
        {
          age: 17,
          guardianApproved: true,
        },
      ),
    ).toEqual({
      allowed: false,
      reason: "This Companion is restricted to adults.",
    });
  });

  it("enforces a non-adult minimum age after guardian approval", () => {
    const mentalSupportPack = BUILTIN_TEMPLATES.find(
      (pack) => pack.id === "official.mental-support",
    );

    expect(mentalSupportPack).toBeDefined();
    expect(
      evaluatePackAccess(mentalSupportPack!, {
        age: 13,
        guardianApproved: true,
      }),
    ).toEqual({
      allowed: false,
      reason: "This Companion requires users to be at least 14.",
    });
    expect(
      evaluatePackAccess(mentalSupportPack!, {
        age: 14,
        guardianApproved: false,
      }),
    ).toEqual({ allowed: true });
  });

  it("enforces custom minimum ages above the adult threshold", () => {
    expect(
      evaluatePackAccess(
        {
          ...ARETE_PACK,
          category: "custom",
          minimumAge: 21,
        },
        {
          age: 18,
          guardianApproved: true,
        },
      ),
    ).toEqual({
      allowed: false,
      reason: "This Companion requires users to be at least 21.",
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects invalid age %s before evaluating a romance pack",
    (age) => {
      expect(
        evaluatePackAccess(
          {
            ...ARETE_PACK,
            category: "romance",
            minimumAge: 18,
          },
          {
            age,
            guardianApproved: true,
          },
        ),
      ).toEqual({
        allowed: false,
        reason: "A valid age is required.",
      });
    },
  );
});

describe("built-in Companion Pack manifests", () => {
  it("freezes the catalog, manifests, and permission arrays", () => {
    expect(Object.isFrozen(BUILTIN_TEMPLATES)).toBe(true);
    expect(BUILTIN_TEMPLATES.every(Object.isFrozen)).toBe(true);
    expect(
      BUILTIN_TEMPLATES.every((pack) => Object.isFrozen(pack.permissions)),
    ).toBe(true);
  });

  it("rejects attempts to mutate the shared catalog and permissions", () => {
    expect(() => {
      (BUILTIN_TEMPLATES as unknown as CompanionPackManifest[]).push(
        ARETE_PACK,
      );
    }).toThrow(TypeError);

    expect(() => {
      (ARETE_PACK.permissions as CompanionPermission[]).push("camera");
    }).toThrow(TypeError);

    expect(ARETE_PACK.permissions).toEqual([
      "network.model",
      "notifications",
    ]);
    expect(
      evaluatePackAccess(ARETE_PACK, {
        age: 15,
        guardianApproved: false,
      }),
    ).toEqual({ allowed: true });
  });
});
