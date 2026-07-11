import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

// ===== Users =====
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  externalId: text("external_id").notNull(),
  channel: text("channel").notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Profiles =====
export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey().references(() => users.id),
  age: integer("age"),
  heightCm: real("height_cm"),
  weightKg: real("weight_kg"),
  goal: text("goal"),
  experience: text("experience"),
  equipment: text("equipment"),
  injuries: text("injuries"),
  availableMinutes: integer("available_minutes"),
  preferences: text("preferences").$default(() => "{}"),
  painPoints: text("pain_points").$default(() => "[]"),
  interests: text("interests").$default(() => "[]"),
  lastUpdated: text("last_updated").notNull().$default(() => new Date().toISOString()),
})

// ===== Memory =====
export const memoryEntries = sqliteTable("memory_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  key: text("key").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata").$default(() => "{}"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Sessions =====
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  channel: text("channel").notNull(),
  messageCount: integer("message_count").$default(() => 0),
  inputTokens: integer("input_tokens").$default(() => 0),
  outputTokens: integer("output_tokens").$default(() => 0),
  summary: text("summary"),
  startedAt: text("started_at").notNull().$default(() => new Date().toISOString()),
  endedAt: text("ended_at"),
})

// ===== Messages =====
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id),
  role: text("role").notNull(),
  content: text("content"),
  toolCalls: text("tool_calls"),
  toolResults: text("tool_results"),
  tokens: integer("tokens"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Relationships =====
export const relationships = sqliteTable("relationships", {
  userId: text("user_id").primaryKey().references(() => users.id),
  score: integer("score").notNull().$default(() => 0),
  trust: integer("trust").notNull().$default(() => 30),
  intimacy: integer("intimacy").notNull().$default(() => 10),
  initiative: integer("initiative").notNull().$default(() => 20),
  attachment: integer("attachment").notNull().$default(() => 5),
  level: integer("level").notNull().$default(() => 1),
  currentXp: integer("current_xp").notNull().$default(() => 0),
  xpToNext: integer("xp_to_next").notNull().$default(() => 100),
  decayRate: real("decay_rate").notNull().$default(() => 1.0),
  lastInteractionAt: text("last_interaction_at"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Mood History =====
export const moodHistory = sqliteTable("mood_history", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  mood: text("mood").notNull(),
  intensity: integer("intensity").notNull(),
  context: text("context"),
  source: text("source").notNull().$default(() => "inferred"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Achievements =====
export const achievements = sqliteTable("achievements", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  achievementId: text("achievement_id").notNull(),
  unlockedAt: text("unlocked_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Milestones =====
export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  milestoneType: text("milestone_type").notNull(),
  value: integer("value").notNull(),
  description: text("description"),
  achievedAt: text("achieved_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Scheduled Messages =====
export const scheduledMessages = sqliteTable("scheduled_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  triggerType: text("trigger_type").notNull(),
  cronExpression: text("cron_expression"),
  condition: text("condition"),
  template: text("template").notNull(),
  nextFireAt: text("next_fire_at"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().$default(() => true),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Durable Jobs =====
export const scheduledJobs = sqliteTable("scheduled_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  payload: text("payload").notNull().$default(() => "{}"),
  runAt: text("run_at").notNull(),
  status: text("status").notNull().$default(() => "queued"),
  attempts: integer("attempts").notNull().$default(() => 0),
  lastError: text("last_error"),
  lockedAt: text("locked_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Goals =====
export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  category: text("category").notNull(),
  target: real("target"),
  current: real("current").notNull().$default(() => 0),
  deadline: text("deadline"),
  status: text("status").notNull().$default(() => "active"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Plans =====
export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull().references(() => goals.id),
  title: text("title").notNull(),
  steps: text("steps").notNull(),
  currentStep: integer("current_step").notNull().$default(() => 0),
  status: text("status").notNull().$default(() => "active"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Diary =====
export const diaryEntries = sqliteTable("diary_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  content: text("content").notNull(),
  moodTags: text("mood_tags"),
  generatedBy: text("generated_by").notNull().$default(() => "companion"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Events =====
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  occurredAt: text("occurred_at").notNull(),
  metadata: text("metadata").$default(() => "{}"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Training Plans =====
export const trainingPlans = sqliteTable("training_plans", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  splitType: text("split_type").notNull(),
  daysPerWeek: integer("days_per_week").notNull(),
  sessionsPerWeek: integer("sessions_per_week").notNull(),
  status: text("status").notNull().$default(() => "active"),
  startedAt: text("started_at").notNull().$default(() => new Date().toISOString()),
  endedAt: text("ended_at"),
})

// ===== Training Sessions =====
export const trainingSessions = sqliteTable("training_sessions", {
  id: text("id").primaryKey(),
  planId: text("plan_id").references(() => trainingPlans.id),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name"),
  date: text("date").notNull(),
  durationMinutes: integer("duration_minutes"),
  exercises: text("exercises").notNull(),
  rpe: real("rpe"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Food Logs =====
export const foodLogs = sqliteTable("food_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  mealType: text("meal_type").notNull(),
  foods: text("foods").notNull(),
  totalCalories: real("total_calories"),
  totalProtein: real("total_protein"),
  totalCarbs: real("total_carbs"),
  totalFat: real("total_fat"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Event Store =====
export const eventStore = sqliteTable("event_store", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  source: text("source").notNull(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  correlationId: text("correlation_id").notNull(),
  payload: text("payload").$default(() => "{}"),
  priority: text("priority").notNull().$default(() => "normal"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
})

// ===== Channel Bindings =====
// (platform, platformUserId) → 内部 userId 的映射
// 让 companion 内部用统一 userId，不关心用户从哪个平台来
export const channelBindings = sqliteTable("channel_bindings", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  platformUserId: text("platform_user_id").notNull(),
  userId: text("user_id").notNull(),
  displayName: text("display_name"),
  createdAt: text("created_at").notNull().$default(() => new Date().toISOString()),
  lastSeenAt: text("last_seen_at"),
})

