export type CompanionCategory =
  | "gentle"
  | "fitness"
  | "study"
  | "romance"
  | "mental_support"
  | "fiction"
  | "custom";

export type UserAgeBand = "under14" | "teen" | "adult";

export interface CompanionTemplate {
  id: string;
  category: CompanionCategory;
  defaultName: string;
  description: string;
}

export interface CompanionProfile {
  id: string;
  templateId: string;
  category: CompanionCategory;
  name: string;
  userDisplayName: string;
  userAgeBand: UserAgeBand;
  description: string;
  createdAt: string;
}

interface CreateCompanionInput {
  template: CompanionTemplate;
  companionName: string;
  userDisplayName: string;
  userAgeBand: UserAgeBand;
  id: string;
  now: string;
}

export function createCompanion(input: CreateCompanionInput): CompanionProfile {
  const name = input.companionName.trim();
  const userDisplayName = input.userDisplayName.trim();

  if (!name) throw new Error("Companion name is required");
  if (!userDisplayName) throw new Error("User display name is required");

  return {
    id: input.id,
    templateId: input.template.id,
    category: input.template.category,
    name,
    userDisplayName,
    userAgeBand: input.userAgeBand,
    description: input.template.description,
    createdAt: input.now,
  };
}
