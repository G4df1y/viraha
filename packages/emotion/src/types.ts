/**
 * 情绪类型与接口定义。
 *
 * 情绪不靠 LLM 猜——用关键词 + 强度信号的轻量识别，
 * 够用、快、零额外 token 成本。
 * 复杂场景留给 pipeline 的 LLM 自己从上下文感知。
 */

/** 基础情绪分类（覆盖日常陪伴场景，刻意不细分过多） */
export type EmotionType =
  | "joy"        // 喜
  | "calm"       // 平静
  | "sad"        // 悲伤
  | "anxious"    // 焦虑
  | "angry"      // 愤怒
  | "lonely"     // 孤独
  | "tired"      // 疲惫
  | "hopeful"    // 期待/希望
  | "neutral"    // 中性

/** 情绪强度 1-5 */
export type EmotionIntensity = 1 | 2 | 3 | 4 | 5

/** 一条情绪记录 */
export interface EmotionRecord {
  id: string
  userId: string
  emotion: EmotionType
  intensity: EmotionIntensity
  /** 触发上下文（用户原话片段或场景标签） */
  context?: string
  /** 识别来源：inferred(从消息推断) / explicit(用户直接说) */
  source: "inferred" | "explicit"
  createdAt: string
}

/** 用户当前情绪状态（聚合近期记录） */
export interface EmotionState {
  /** 当前主导情绪 */
  current: EmotionType
  /** 当前强度 */
  intensity: EmotionIntensity
  /** 近 7 天情绪趋势：从早到晚的主导情绪序列 */
  trend: EmotionType[]
  /** 近 7 天正向情绪占比 (0-1) */
  positivityRatio: number
  /** 最近一次情绪记录时间 */
  lastUpdated: string
}

/** 情绪的中文标签（喂给 prompt 用） */
export const emotionLabel: Record<EmotionType, string> = {
  joy: "开心",
  calm: "平静",
  sad: "低落",
  anxious: "焦虑",
  angry: "生气",
  lonely: "孤独",
  tired: "疲惫",
  hopeful: "满怀期待",
  neutral: "中性",
}

/** 情绪对应的回应调性指引（喂给 prompt，让 LLM 调风格） */
export const emotionToneGuide: Record<EmotionType, string> = {
  joy: "用户很开心，一起高兴但别过度捧场，真诚回应这份喜悦。",
  calm: "用户状态平静，保持自然平稳的对话节奏。",
  sad: "用户低落，先共情再陪伴，别急着给建议或讲道理。语气放轻。",
  anxious: "用户焦虑，先稳住再拆解。别说'别担心'，承认这份不安。",
  angry: "用户生气，先认可情绪再讨论。别急着反驳或和稀泥。",
  lonely: "用户孤独，让他感觉到你在。不必填满沉默，陪伴本身就是回应。",
  tired: "用户疲惫，别给长建议。短一点、暖一点。",
  hopeful: "用户有期待，认真对待这份期待，别泼冷水也别过度承诺。",
  neutral: "中性状态，自然对话。",
}
