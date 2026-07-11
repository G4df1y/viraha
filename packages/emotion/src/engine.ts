/**
 * EmotionEngine —— 情绪引擎
 *
 * 职责：
 * 1. 从用户消息识别情绪（关键词 + 强度信号，零 LLM 调用）
 * 2. 写入 moodHistory 表（情绪记忆）
 * 3. 聚合近期情绪为 EmotionState（当前状态 + 趋势）
 * 4. 输出情绪上下文片段，喂回 pipeline 的 system prompt
 */
import { getDb } from "@viraha/db"
import { moodHistory } from "@viraha/db"
import { eq, desc, and, gte } from "drizzle-orm"
import type {
  EmotionType, EmotionIntensity, EmotionRecord, EmotionState,
} from "./types.js"
import { emotionLabel, emotionToneGuide } from "./types.js"

// ===== 关键词词典（中文为主，覆盖日常陪伴场景） =====
// 刻意保持轻量：能识别"明显的情绪信号"即可，不追求细粒度情感分析。
const KEYWORDS: Array<{ emotion: EmotionType; words: string[]; intensity: EmotionIntensity }> = [
  // 高强度正向
  { emotion: "joy", intensity: 4, words: ["太棒了", "超开心", "哈哈哈", "好开心", "太好了", "兴奋", "激动", "圆满", "完美"] },
  { emotion: "joy", intensity: 3, words: ["开心", "高兴", "不错", "挺好", "喜欢", "好玩", "有趣", "笑"] },
  // 平静
  { emotion: "calm", intensity: 2, words: ["平静", "还好", "一般", "没事", "还行", "就这样"] },
  // 悲伤
  { emotion: "sad", intensity: 4, words: ["好难过", "好伤心", "崩溃", "心痛", "想哭", "泪", "失去", "分手", "离世"] },
  { emotion: "sad", intensity: 3, words: ["难过", "伤心", "失落", "失望", "遗憾", "低落", "emo"] },
  // 焦虑
  { emotion: "anxious", intensity: 4, words: ["好焦虑", "很紧张", "压力好大", "害怕", "恐惧", "担心死了", "心慌"] },
  { emotion: "anxious", intensity: 3, words: ["焦虑", "紧张", "压力", "担心", "纠结", "犹豫", "不安"] },
  // 愤怒
  { emotion: "angry", intensity: 4, words: ["气死", "烦死", "受够了", "恶心", "垃圾", "可恶", "凭什么"] },
  { emotion: "angry", intensity: 3, words: ["生气", "烦", "讨厌", "无语", "受不了", "气"] },
  // 孤独
  { emotion: "lonely", intensity: 4, words: ["好孤独", "没人理", "一个人", "没人懂", "好孤单", "想有人陪"] },
  { emotion: "lonely", intensity: 3, words: ["孤独", "孤单", "寂寞", "无聊", "冷清"] },
  // 疲惫
  { emotion: "tired", intensity: 4, words: ["累死了", "撑不住", "精疲力尽", "心力交瘁", "好困好累"] },
  { emotion: "tired", intensity: 3, words: ["累", "困", "疲惫", "没力气", "心力不足", "倦"] },
  // 期待
  { emotion: "hopeful", intensity: 3, words: ["期待", "希望", "憧憬", "向往", "盼", "等着", "明天"] },
]

// 强度修饰词：叠加在基础强度上
const INTENSIFIERS = ["好", "很", "超", "太", "特别", "非常", "极其", "真的"]
const DIMINISHERS = ["有点", "稍微", "一点", "还好"]

/** 从文本识别情绪（纯函数，无副作用） */
export function detectEmotion(text: string): { emotion: EmotionType; intensity: EmotionIntensity; context?: string } | null {
  for (const entry of KEYWORDS) {
    for (const word of entry.words) {
      if (text.includes(word)) {
        let intensity = entry.intensity
        // 检查修饰词
        const prefix = text.substring(0, text.indexOf(word))
        if (INTENSIFIERS.some(i => prefix.endsWith(i)) || INTENSIFIERS.some(i => word.startsWith(i))) {
          intensity = Math.min(5, intensity + 1) as EmotionIntensity
        }
        if (DIMINISHERS.some(d => prefix.endsWith(d))) {
          intensity = Math.max(1, intensity - 1) as EmotionIntensity
        }
        return { emotion: entry.emotion, intensity, context: word }
      }
    }
  }
  return null
}

export class EmotionEngine {
  /**
   * 识别并记录用户情绪。
   * @returns 识别到的情绪记录，或 null（无明显情绪信号）
   */
  async detectAndRecord(
    userId: string,
    message: string,
    source: "inferred" | "explicit" = "inferred",
  ): Promise<EmotionRecord | null> {
    const detected = detectEmotion(message)
    if (!detected) return null

    return this.record(userId, detected.emotion, detected.intensity, detected.context, source)
  }

  /** 直接记录一条情绪（用户显式报备情绪时用） */
  async record(
    userId: string,
    emotion: EmotionType,
    intensity: EmotionIntensity,
    context?: string,
    source: "inferred" | "explicit" = "explicit",
  ): Promise<EmotionRecord> {
    const db = getDb()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await db.insert(moodHistory).values({
      id,
      userId,
      mood: emotion,
      intensity,
      context: context ?? null,
      source,
      createdAt: now,
    })
    return { id, userId, emotion, intensity, context, source, createdAt: now }
  }

  /** 获取用户当前情绪状态（聚合近 7 天） */
  async getState(userId: string): Promise<EmotionState> {
    const db = getDb()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const recent = await db.query.moodHistory.findMany({
      where: and(eq(moodHistory.userId, userId), gte(moodHistory.createdAt, sevenDaysAgo)),
      orderBy: desc(moodHistory.createdAt),
      limit: 50,
    })

    if (recent.length === 0) {
      return {
        current: "neutral",
        intensity: 1,
        trend: [],
        positivityRatio: 0,
        lastUpdated: new Date().toISOString(),
      }
    }

    // 当前情绪 = 最近一条
    const latest = recent[0]
    const current = latest.mood as EmotionType
    const intensity = latest.intensity as EmotionIntensity

    // 趋势：按天聚合，取每天最后一条的主导情绪
    const byDay = new Map<string, EmotionType>()
    for (const r of recent) {
      const day = r.createdAt.substring(0, 10)
      byDay.set(day, r.mood as EmotionType) // recent 是倒序，先存的是最新的
    }
    const trend = Array.from(byDay.values()).reverse() // 从早到晚

    // 正向占比
    const positive: EmotionType[] = ["joy", "calm", "hopeful"]
    const positivityRatio = recent.filter(r => positive.includes(r.mood as EmotionType)).length / recent.length

    return {
      current,
      intensity,
      trend,
      positivityRatio,
      lastUpdated: latest.createdAt,
    }
  }

  /** 获取近期情绪记录列表 */
  async getRecent(userId: string, limit = 10): Promise<EmotionRecord[]> {
    const db = getDb()
    const rows = await db.query.moodHistory.findMany({
      where: eq(moodHistory.userId, userId),
      orderBy: desc(moodHistory.createdAt),
      limit,
    })
    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      emotion: r.mood as EmotionType,
      intensity: r.intensity as EmotionIntensity,
      context: r.context ?? undefined,
      source: r.source as "inferred" | "explicit",
      createdAt: r.createdAt,
    }))
  }

  /**
   * 生成情绪上下文片段，注入 system prompt。
   * 让 LLM 知道用户当前情绪 + 调性指引。
   */
  async buildEmotionContext(userId: string): Promise<string> {
    const state = await this.getState(userId)
    if (state.current === "neutral" && state.trend.length === 0) {
      return "" // 无情绪数据，不注入
    }

    const label = emotionLabel[state.current]
    const guide = emotionToneGuide[state.current]
    const trendStr = state.trend.length > 0
      ? state.trend.map(e => emotionLabel[e]).join(" → ")
      : "无"

    return `## User Emotional State\n当前情绪：${label}（强度 ${state.intensity}/5）\n近 7 天趋势：${trendStr}\n正向占比：${Math.round(state.positivityRatio * 100)}%\n\n回应调性：${guide}`
  }
}
