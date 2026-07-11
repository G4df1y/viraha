import { describe, expect, it } from "vitest";

import { ARETE_PACK, evaluatePackAccess } from "../src/index.js";

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
});
