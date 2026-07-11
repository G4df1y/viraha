import type { CompanionCategory, CompanionTemplate } from "./companion.js";

export type CompanionPermission =
  | "network.model"
  | "microphone"
  | "camera"
  | "notifications"
  | "health.read"
  | "channel.send";

export interface CompanionPackManifest extends CompanionTemplate {
  readonly id: string;
  readonly version: string;
  readonly author: string;
  readonly category: CompanionCategory;
  readonly defaultName: string;
  readonly description: string;
  readonly minimumAge: number;
  readonly permissions: readonly CompanionPermission[];
}

export type PackAccessResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export function evaluatePackAccess(
  pack: CompanionPackManifest,
  user: { age: number; guardianApproved: boolean },
): PackAccessResult {
  if (
    !Number.isFinite(user.age) ||
    !Number.isInteger(user.age) ||
    user.age < 0 ||
    user.age > 130
  ) {
    return {
      allowed: false,
      reason: "A valid age is required.",
    };
  }

  if (user.age < 14 && !user.guardianApproved) {
    return {
      allowed: false,
      reason: "Guardian approval is required for users under 14.",
    };
  }

  if (
    user.age < 18 &&
    (pack.minimumAge >= 18 || pack.category === "romance")
  ) {
    return {
      allowed: false,
      reason: "This Companion is restricted to adults.",
    };
  }

  if (user.age < pack.minimumAge) {
    return {
      allowed: false,
      reason: `This Companion requires users to be at least ${pack.minimumAge}.`,
    };
  }

  return { allowed: true };
}
