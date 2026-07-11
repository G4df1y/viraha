import type { CompanionCategory, CompanionTemplate } from "./companion.js";

export type CompanionPermission =
  | "network.model"
  | "microphone"
  | "camera"
  | "notifications"
  | "health.read"
  | "channel.send";

export interface CompanionPackManifest extends CompanionTemplate {
  version: string;
  author: string;
  minimumAge: number;
  permissions: CompanionPermission[];
  category: CompanionCategory;
}

export type PackAccessResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export function evaluatePackAccess(
  pack: CompanionPackManifest,
  user: { age: number; guardianApproved: boolean },
): PackAccessResult {
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

  return { allowed: true };
}
