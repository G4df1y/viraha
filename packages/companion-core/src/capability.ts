import type { Instant } from "./time.js";

export type CapabilityPermissionKind =
  | "read"
  | "act"
  | "remember"
  | "background";

export type CapabilityGrantScope = "once" | "always";

export type CapabilitySideEffect = "none" | "reversible" | "irreversible";

export type CapabilityRisk = "low" | "medium" | "high";

export interface CapabilityPermissionRequirement {
  id: string;
  kind: CapabilityPermissionKind;
  reason: string;
  required: boolean;
  dataCategories?: string[];
}

export interface CapabilityManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  description: string;
  author: string;
  license: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  permissions: CapabilityPermissionRequirement[];
  sideEffect: CapabilitySideEffect;
  risk: CapabilityRisk;
}

interface CapabilityGrantBase {
  id: string;
  capabilityId: string;
  permissionId: string;
  userId: string;
  grantedAt: Instant;
  expiresAt?: Instant;
  revokedAt?: Instant;
}

export type CapabilityGrant = CapabilityGrantBase &
  (
    | { scope: "once"; remainingUses?: 0 | 1 }
    | { scope: "always"; remainingUses?: never }
  );

export type CapabilityAccessDecision =
  | { allowed: true; grantIds: string[] }
  | {
      allowed: false;
      missingPermissionIds: string[];
      reason: string;
    };

export type CapabilityOutcome = "completed" | "denied" | "failed";

export interface CapabilityObservation {
  id: string;
  capabilityId: string;
  userId: string;
  surfaceId: string;
  correlationId: string;
  outcome: CapabilityOutcome;
  startedAt: Instant;
  completedAt: Instant;
  durationMs: number;
  grantIds: string[];
  sideEffects: string[];
  reason?: string;
}

const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const CAPABILITY_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function defineCapability(
  input: CapabilityManifest,
): CapabilityManifest {
  if (!CAPABILITY_ID_PATTERN.test(input.id)) {
    throw new Error("Capability id must be lowercase and namespace-safe");
  }

  if (!CAPABILITY_VERSION_PATTERN.test(input.version)) {
    throw new Error("Capability version must use major.minor.patch");
  }

  const permissionIds = new Set<string>();

  for (const permission of input.permissions) {
    if (permissionIds.has(permission.id)) {
      throw new Error("Capability permission ids must be unique");
    }

    permissionIds.add(permission.id);

    if (permission.reason.trim().length === 0) {
      throw new Error(`Capability permission ${permission.id} needs a reason`);
    }
  }

  return input;
}

function isGrantActive(grant: CapabilityGrant, now: Instant): boolean {
  if (grant.revokedAt !== undefined) {
    return false;
  }

  if (grant.grantedAt.epochMs > now.epochMs) {
    return false;
  }

  if (grant.expiresAt !== undefined && grant.expiresAt.epochMs <= now.epochMs) {
    return false;
  }

  if (grant.scope === "once" && (grant.remainingUses ?? 1) <= 0) {
    return false;
  }

  return true;
}

function selectPreferredGrant(
  grants: CapabilityGrant[],
  permissionId: string,
): CapabilityGrant | undefined {
  let selected: CapabilityGrant | undefined;

  for (const candidate of grants) {
    if (candidate.permissionId !== permissionId) {
      continue;
    }

    if (
      selected === undefined ||
      candidate.grantedAt.epochMs > selected.grantedAt.epochMs ||
      (candidate.grantedAt.epochMs === selected.grantedAt.epochMs &&
        candidate.id < selected.id)
    ) {
      selected = candidate;
    }
  }

  return selected;
}

export function evaluateCapabilityAccess(
  manifest: CapabilityManifest,
  grants: CapabilityGrant[],
  userId: string,
  now: Instant,
): CapabilityAccessDecision {
  const activeGrants = grants.filter(
    (grant) =>
      grant.userId === userId &&
      grant.capabilityId === manifest.id &&
      isGrantActive(grant, now),
  );
  const requiredPermissions = manifest.permissions.filter(
    (permission) => permission.required,
  );
  const selectedGrantIds: string[] = [];
  const missingPermissionIds: string[] = [];

  for (const permission of requiredPermissions) {
    const grant = selectPreferredGrant(activeGrants, permission.id);

    if (grant === undefined) {
      missingPermissionIds.push(permission.id);
    } else {
      selectedGrantIds.push(grant.id);
    }
  }

  if (missingPermissionIds.length > 0) {
    return {
      allowed: false,
      missingPermissionIds,
      reason: `Missing required Capability permissions: ${missingPermissionIds.join(
        ", ",
      )}`,
    };
  }

  return { allowed: true, grantIds: selectedGrantIds };
}
