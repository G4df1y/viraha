import type { CompanionPackManifest } from "./packs.js";

function freezePack(pack: CompanionPackManifest): CompanionPackManifest {
  return Object.freeze({
    ...pack,
    permissions: Object.freeze([...pack.permissions]),
  });
}

export const ARETE_PACK = freezePack({
  id: "official.arete",
  version: "1.0.0",
  author: "Viraha",
  category: "fitness",
  defaultName: "Arete",
  description: "陪伴你训练、恢复并长期成长的健身伙伴。",
  minimumAge: 0,
  permissions: ["network.model", "notifications"],
});

export const ARETE_TEMPLATE = ARETE_PACK;

export const BUILTIN_TEMPLATES: readonly CompanionPackManifest[] =
  Object.freeze([
    freezePack({
      id: "official.gentle",
      version: "1.0.0",
      author: "Viraha",
      category: "gentle",
      defaultName: "Luna",
      description: "温柔倾听、尊重边界的日常陪伴伙伴。",
      minimumAge: 0,
      permissions: ["network.model"],
    }),
    ARETE_PACK,
    freezePack({
      id: "official.study",
      version: "1.0.0",
      author: "Viraha",
      category: "study",
      defaultName: "Study",
      description: "帮助规划学习、复习和保持好奇心的学习伙伴。",
      minimumAge: 0,
      permissions: ["network.model"],
    }),
    freezePack({
      id: "official.romance",
      version: "1.0.0",
      author: "Viraha",
      category: "romance",
      defaultName: "Lumi",
      description: "仅面向成年人的尊重边界型恋爱陪伴伙伴。",
      minimumAge: 18,
      permissions: ["network.model"],
    }),
    freezePack({
      id: "official.mental-support",
      version: "1.0.0",
      author: "Viraha",
      category: "mental_support",
      defaultName: "Mori",
      description: "提供一般情绪支持但不替代专业治疗的伙伴。",
      minimumAge: 14,
      permissions: ["network.model"],
    }),
    freezePack({
      id: "official.fiction",
      version: "1.0.0",
      author: "Viraha",
      category: "fiction",
      defaultName: "Story",
      description: "共同讨论角色、世界和故事的小说伙伴。",
      minimumAge: 0,
      permissions: ["network.model"],
    }),
    freezePack({
      id: "official.custom",
      version: "1.0.0",
      author: "Viraha",
      category: "custom",
      defaultName: "Companion",
      description: "由用户定义称呼与方向的自定义伙伴。",
      minimumAge: 14,
      permissions: ["network.model"],
    }),
  ]);
