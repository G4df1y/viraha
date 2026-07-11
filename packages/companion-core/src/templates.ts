import type { CompanionTemplate } from "./companion.js";

export const ARETE_TEMPLATE: CompanionTemplate = {
  id: "official.arete",
  category: "fitness",
  defaultName: "Arete",
  description: "陪伴你训练、恢复并长期成长的健身伙伴。",
};

export const BUILTIN_TEMPLATES: CompanionTemplate[] = [
  {
    id: "official.gentle",
    category: "gentle",
    defaultName: "Luna",
    description: "温柔倾听、尊重边界的日常陪伴伙伴。",
  },
  ARETE_TEMPLATE,
  {
    id: "official.study",
    category: "study",
    defaultName: "Study",
    description: "帮助规划学习、复习和保持好奇心的学习伙伴。",
  },
  {
    id: "official.romance",
    category: "romance",
    defaultName: "Lumi",
    description: "仅面向成年人的尊重边界型恋爱陪伴伙伴。",
  },
  {
    id: "official.mental-support",
    category: "mental_support",
    defaultName: "Mori",
    description: "提供一般情绪支持但不替代专业治疗的伙伴。",
  },
  {
    id: "official.fiction",
    category: "fiction",
    defaultName: "Story",
    description: "共同讨论角色、世界和故事的小说伙伴。",
  },
  {
    id: "official.custom",
    category: "custom",
    defaultName: "Companion",
    description: "由用户定义称呼与方向的自定义伙伴。",
  },
];
