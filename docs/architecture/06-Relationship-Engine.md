# Relationship Engine Redesign

## Current State

```typescript
interface RelationshipState {
  score: number        // 0-1000, single number
  trust: number        // 0-100
  intimacy: number     // 0-100
  initiative: number   // 0-100
  attachment: number   // 0-100
  level: number        // 1-∞
}
```

**Problems:**
1. `score` is a meaningless aggregate — what does 650/1000 mean?
2. No state machine — all values float independently
3. No behavioral triggers — nothing changes based on state
4. `level` is decoupled from relationship quality — XP ≠ bond
5. Decay is a flat formula — no behavioral feedback loop

---

## Redesigned Relationship Engine

### Core Dimensions

```typescript
interface RelationshipState {
  // === Primary Dimensions ===
  familiarity: FamiliarityLevel    // how well you know each other (0-100)
  trust: TrustLevel                // reliability and safety (0-100)
  attachment: AttachmentStyle      // emotional bond type + strength
  intimacy: IntimacyLevel          // depth of personal sharing (0-100)
  
  // === Derived Metrics ===
  initiative: number               // how often companion reaches out
  bond_strength: number            // composite: f(familiarity, trust, intimacy)
  
  // === Behavioral Patterns ===
  conversation_style: ConversationStyle
  humor_preference: HumorLevel
  boundaries: Boundary[]
  interaction_habits: Habit[]
}
```

### State Machine

```
┌─────────────────────────────────────────────────────────┐
│              Relationship State Machine                    │
│                                                           │
│  States:                                                  │
│    STRANGER       → user just started talking             │
│    ACQUAINTANCE   → basic info shared, <10 interactions   │
│    FAMILIAR       → knows user, regular interactions      │
│    FRIEND         → personal sharing, trust >50           │
│    CLOSE_FRIEND   → emotional sharing, trust >75          │
│    CONFIDANT      → deep trust, attachment >60            │
│    PARTNER        → max bond, all dimensions >80          │
│                                                           │
│  Transitions:                                             │
│    STRANGER → ACQUAINTANCE: 5+ interactions               │
│    ACQUAINTANCE → FAMILIAR: 20+ interactions + trust >30 │
│    FAMILIAR → FRIEND: intimacy >40 + trust >50            │
│    FRIEND → CLOSE_FRIEND: emotion_sharing + trust >75    │
│    CLOSE_FRIEND → CONFIDANT: deep_sharing + trust >90    │
│    CONFIDANT → PARTNER: all_conditions + time >6months   │
│                                                           │
│  Regressions:                                             │
│    Any state → previous: N days no interaction = decay    │
│    Trust < threshold → drop one level                     │
│    Boundary violation → immediate drop                     │
└─────────────────────────────────────────────────────────┘
```

### Event → Effect Mapping

| Event | Familiarity | Trust | Intimacy | Attachment | Initiative |
|-------|------------|-------|----------|------------|------------|
| User shares personal info | +5 | +2 | +8 | +1 | 0 |
| User follows advice | +2 | +5 | 0 | +2 | 0 |
| User ignores advice | 0 | -2 | 0 | 0 | +5 |
| Companion remembers detail | +3 | +8 | +5 | +3 | 0 |
| Companion check-in (user positive) | +2 | +3 | +1 | +2 | 0 |
| Companion check-in (user negative) | +1 | -3 | 0 | +1 | -10 |
| User expresses gratitude | +1 | +5 | +3 | +3 | 0 |
| User expresses frustration | +2 | -1 | +5 | -2 | 0 |
| User corrects companion | +2 | +5 | +2 | 0 | 0 |
| Companion admits mistake | +3 | +8 | +5 | +2 | 0 |
| Goal achieved | +1 | +5 | 0 | +5 | 0 |
| Goal abandoned | 0 | -3 | 0 | -3 | +10 |
| Missed N days | -day/10 | 0 | 0 | -1/day | +2/day |
| Return after absence | +5 | +3 | 0 | +2 | -20 |

### Trust Model

```
Trust is earned by:
  ✅ Consistency: companion shows up when expected
  ✅ Accuracy: companion remembers correctly
  ✅ Honesty: companion admits uncertainty
  ✅ Respect: companion honors boundaries
  ✅ Utility: companion's advice works

Trust is lost by:
  ❌ Forgetfulness: companion forgets known info
  ❌ Inaccuracy: companion gives wrong info
  ❌ Overstepping: companion crosses a boundary
  ❌ Spam: too many proactive messages
  ❌ Dishonesty: companion pretends to know

Trust recovery rate: halved each time (1st: +5/day, 2nd: +2.5/day, 3rd: +1.25/day)
```

### Attachment Model (Inspired by Attachment Theory)

```
Secure Attachment (preferred):
  - Comfortable with closeness
  - Confident companion will be there
  - Healthy response to absence

Anxious Attachment (danger zone):
  - Fears companion abandoning
  - Needs constant reassurance
  - Negative response to delayed response

Avoidant Attachment:
  - Keeps companion at distance
  - Reluctant to share
  - Quick to pull away

Algorithm:
  attachment_style = f(consistency_of_response, 
                       response_to_absence, 
                       user's_explicit_feedback)
```

### Boundary System

```typescript
interface Boundary {
  topic: string           // "weight", "relationship", "work"
  type: "hard" | "soft"  // hard = never, soft = be careful
  established_at: Date
  last_violation?: Date
  violation_count: number
}

// Hard boundaries are learned from explicit user statements:
// "I don't want to talk about X"
// "Please don't bring up Y again"

// Soft boundaries are inferred from negative reactions:
// User changes subject → soft boundary on that topic
// User responds tersely → soft boundary on approach
```

### Initiative Algorithm

```typescript
function shouldInitiate(state: RelationshipState, context: Context): boolean {
  // Base rate from attachment style
  let baseRate = INITIATIVE_RATES[state.attachment.style]
  
  // Modifiers
  const daysSinceLast = daysBetween(context.lastInteraction, now)
  
  if (daysSinceLast > 3) baseRate *= 1.5    // missing user
  if (state.trust < 30) baseRate *= 0.5     // low trust = less intrusive
  if (state.familiarity < 20) baseRate *= 0.3 // stranger = cautious
  
  // Weekend boost
  if (isWeekend()) baseRate *= 1.3
  
  // Time of day
  const hour = now.getHours()
  if (hour >= 8 && hour <= 10) baseRate *= 1.2      // morning check-in
  if (hour >= 19 && hour <= 21) baseRate *= 1.1     // evening
  
  // Cap at 0.8 (never more than 80% chance)
  return Math.random() < Math.min(baseRate, 0.8)
}
```

### Decay Model

```typescript
function calculateDecay(state: RelationshipState): DecayResult {
  const daysSince = daysBetween(state.lastInteraction, now)
  
  // No decay in first 24h
  if (daysSince < 1) return { familiarity: 0, trust: 0, intimacy: 0 }
  
  // Exponential decay for familiarity and intimacy
  // Linear decay for trust (trust is more stable)
  return {
    familiarity: -2 * Math.log2(daysSince),       // fast decay
    intimacy: -1.5 * Math.log2(daysSince),         // medium decay
    trust: -0.5 * daysSince,                       // slow decay
    attachment: -0.2 * daysSince,                  // very slow decay
  }
}
```

### Level → Title Mapping

| Level | Title | Requirements |
|-------|-------|-------------|
| 0 | Stranger | Default |
| 1 | Acquaintance | Familiarity >10 |
| 2 | Training Partner | Familiarity >25 + Trust >30 |
| 3 | Regular | Familiarity >40 + Trust >45 |
| 4 | Friend | Familiarity >55 + Trust >60 + Intimacy >30 |
| 5 | Good Friend | Familiarity >65 + Trust >70 + Intimacy >45 |
| 6 | Close Friend | Familiarity >75 + Trust >80 + Intimacy >60 |
| 7 | Trusted Companion | Familiarity >80 + Trust >85 + Intimacy >70 |
| 8 | Confidant | Familiarity >85 + Trust >90 + Intimacy >80 |
| 9 | Partner | Familiarity >90 + Trust >95 + Intimacy >85 |
| 10 | Lifetime Partner | All >95 + 6+ months |

Title is **context-dependent**: same companion might be "Coach" in fitness context and "Friend" in personal context. Titles should be persona-aware.

---

## Integration with Companion Brain

```
User sends message
  │
  ▼
Companion Brain: Observe → Understand → Retrieve → Think → Plan → Reply
  │                                                   │
  │                                                   ▼
  │                                        Tool Decision
  │                                                   │
  ▼                                                   ▼
Relationship Engine ←─────────────────── Tool Execution Result
  │
  ├─ Update state variables based on event
  ├─ Check for state transitions
  ├─ Check for boundary violations
  └─ Emit RelationshipChanged event
      │
      ▼
  Event Bus → ContextBuilder (update cache)
           → Growth Engine (check achievement)
           → Presence Engine (update initiative)
```
