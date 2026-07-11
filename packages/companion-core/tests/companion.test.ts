import { describe, expect, it } from "vitest";

import { ARETE_TEMPLATE, createCompanion } from "../src/index.js";

describe("createCompanion", () => {
  it("creates an Arete companion profile", () => {
    const now = "2026-07-11T00:00:00.000Z";

    const companion = createCompanion({
      template: ARETE_TEMPLATE,
      companionName: "Arete",
      userDisplayName: "神龙",
      userAgeBand: "adult",
      id: "companion-1",
      now,
    });

    expect(companion).toEqual({
      id: "companion-1",
      templateId: "official.arete",
      category: "fitness",
      name: "Arete",
      userDisplayName: "神龙",
      userAgeBand: "adult",
      description: "陪伴你训练、恢复并长期成长的健身伙伴。",
      createdAt: "2026-07-11T00:00:00.000Z",
    });
  });

  it("requires a companion name", () => {
    expect(() =>
      createCompanion({
        template: ARETE_TEMPLATE,
        companionName: "   ",
        userDisplayName: "神龙",
        userAgeBand: "adult",
        id: "companion-1",
        now: "2026-07-11T00:00:00.000Z",
      }),
    ).toThrow("Companion name is required");
  });
});
