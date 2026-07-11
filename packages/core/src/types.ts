import { z } from "zod"

// ===== Message =====
export const MessageRole = z.enum(["user", "assistant", "tool", "system", "summary"])
export type MessageRole = z.infer<typeof MessageRole>

export interface Message {
  id: string
  role: MessageRole
  content: string
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
  tokens?: number
  createdAt: Date
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResult {
  toolCallId: string
  name: string
  result: unknown
  isError?: boolean
}

// ===== Session =====
export interface SessionInfo {
  id: string
  userId: string
  channel: string
  messageCount: number
  inputTokens: number
  outputTokens: number
  summary?: string
  startedAt: Date
  endedAt?: Date
}

// ===== Turn =====
export interface TurnInput {
  userId: string
  channel: string
  content: string
  images?: string[]
  metadata?: Record<string, unknown>
}

export interface TurnResult {
  reply: string
  sessionId: string
  tokensUsed: { input: number; output: number }
  toolCalls: ToolCall[]
}

// ===== User =====
export interface UserProfile {
  age?: number
  heightCm?: number
  weightKg?: number
  goal?: string
  experience?: string
  equipment?: string[]
  injuries?: string[]
  availableMinutes?: number
  preferences: Record<string, unknown>
  painPoints: string[]
  interests: string[]
  lastUpdated: Date
}

// ===== Memory =====
export type MemoryType = "long_term" | "episodic" | "emotional" | "reflection"

export interface MemoryEntry {
  id: string
  userId: string
  type: MemoryType
  key: string
  content: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface EmotionEntry {
  timestamp: Date
  mood: string
  intensity: number
  context: string
  source: "explicit" | "inferred"
}

export interface EmotionalProfile {
  baseline: "positive" | "neutral" | "negative"
  volatility: number
  triggers: Array<{ pattern: string; response: string }>
  recentHistory: EmotionEntry[]
}

// ===== Companion =====
export interface RelationshipState {
  userId: string
  score: number
  trust: number
  intimacy: number
  initiative: number
  attachment: number
  level: number
  currentXp: number
  xpToNext: number
  decayRate: number
  lastInteractionAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface InitiationPlan {
  type: "checkin" | "encourage" | "celebrate" | "remind" | "suggest"
  trigger: string
  message: string
  priority: number
  validUntil: Date
}

export interface MoodState {
  current: string
  intensity: number
  adaptability: number
}

// ===== Goal/Workflow =====
export interface Goal {
  id: string
  userId: string
  title: string
  category: string
  target?: number
  current: number
  deadline?: Date
  status: "active" | "paused" | "completed" | "abandoned"
}

export interface Plan {
  id: string
  goalId: string
  title: string
  steps: PlanStep[]
  currentStep: number
  status: "active" | "completed" | "abandoned"
}

export interface PlanStep {
  title: string
  description: string
  completed: boolean
}

// ===== Diary =====
export interface DiaryEntry {
  id: string
  userId: string
  date: string
  content: string
  moodTags: string[]
  generatedBy: string
}

// ===== Event =====
export interface CompanionEvent {
  id: string
  userId: string
  eventType: string
  title: string
  description?: string
  occurredAt: Date
  metadata: Record<string, unknown>
}

// ===== Training (Fitness Domain) =====
export type SplitType = "ppl" | "upper_lower" | "phul" | "phat" | "full_body"

export interface TrainingPlan {
  id: string
  userId: string
  name: string
  splitType: SplitType
  daysPerWeek: number
  sessionsPerWeek: number
  status: "active" | "completed" | "paused"
}

export interface TrainingExercise {
  name: string
  sets: number
  reps: number
  weightKg?: number
  notes?: string
}

export interface TrainingSession {
  id: string
  planId: string
  userId: string
  name?: string
  date: string
  durationMinutes?: number
  exercises: TrainingExercise[]
  rpe?: number
  notes?: string
}

export interface FoodLog {
  id: string
  userId: string
  date: string
  mealType: "breakfast" | "lunch" | "dinner" | "snack"
  foods: Array<{ name: string; amount: string; calories: number; protein: number; carbs: number; fat: number }>
  totalCalories: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
}

// ===== Achievement =====
export interface Achievement {
  id: string
  userId: string
  achievementId: string
  unlockedAt: Date
}

export interface Milestone {
  id: string
  userId: string
  milestoneType: string
  value: number
  description?: string
  achievedAt: Date
}

// ===== Presence =====
export interface ScheduledMessage {
  id: string
  userId: string
  type: string
  triggerType: "cron" | "event" | "threshold"
  cronExpression?: string
  condition?: string
  template: string
  nextFireAt?: Date
  isActive: boolean
}

// ===== Event System =====
export type EventType =
  | "UserMessageReceived"
  | "AgentThinking"
  | "AgentResponseSent"
  | "MessageStored"
  | "ToolCalled"
  | "ToolFailed"
  | "MemoryCreated"
  | "MemoryUpdated"
  | "ReflectionCompleted"
  | "RelationshipChanged"
  | "TrustChanged"
  | "StateTransition"
  | "AchievementUnlocked"
  | "LevelUp"
  | "GoalUpdated"
  | "GoalCompleted"
  | "PresenceTriggered"
  | "SessionCreated"
  | "SessionEnded"
  | "ErrorOccurred"
  | "SafetyBoundaryTriggered"
  | "ChannelMessageSent"
  | "ChannelSendFailed"

export interface EventEnvelope {
  id: string
  type: EventType
  source: string
  timestamp: string
  correlationId: string
  payload: Record<string, unknown>
  metadata: {
    userId?: string
    sessionId?: string
    priority: "low" | "normal" | "high"
  }
}

export type EventHandler = (event: EventEnvelope) => Promise<void>

// ===== Port Interfaces (DIP) =====
export interface MemoryPort {
  getProfileSummary(userId: string): Promise<string>
  getMemorySummary(userId: string): Promise<string>
  getProfile(userId: string): Promise<any>
  getOrCreateUser(externalId: string, channel: string, name: string): Promise<string>
  storeMemory(userId: string, type: string, key: string, content: string): Promise<string>
}

export interface CompanionPort {
  getRelationshipState(userId: string): Promise<any>
  getRelationshipSummary(state: any): string
  recordInteraction(userId: string): Promise<void>
  addXp(userId: string, amount: number): Promise<any>
}

export interface ContextPort {
  assemble(userId: string, sessionId: string, input: string, ctx?: any): Promise<{
    tiers: { stable: string[]; context: string[]; volatile: string[]; ephemeral: string[] }
    systemPrompt: string
    tokenUsage: { total: number; bySource: Record<string, number> }
  }>
}

