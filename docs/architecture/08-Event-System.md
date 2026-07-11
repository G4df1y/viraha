# Event System Design

## Current State

1 EventBus implementation, 1 event emitted, 0 subscribers. The event system is purely decorative.

## Target: Event-Driven Architecture

All module communication happens through events. No direct imports between engines.

### Event Bus Interface

```typescript
interface EventBus {
  // Typed publish/subscribe
  publish<T>(event: Event<T>): Promise<void>
  subscribe<T>(eventType: string, handler: EventHandler<T>): Subscription
  
  // Structured event envelope
  emit(event: Envelope): Promise<void>
  
  // Observability
  getHistory(filter?: EventFilter): EventRecord[]
  getMetrics(): EventMetrics
  
  // Lifecycle
  start(): Promise<void>
  stop(): Promise<void>
}

interface Envelope {
  id: string
  type: string
  source: string           // module that emitted
  timestamp: Date
  version: number          // schema version
  correlationId: string    // trace across events
  causationId: string      // parent event
  payload: unknown
  metadata: {
    userId?: string
    sessionId?: string
    priority: "low" | "normal" | "high"
  }
}
```

---

## Event Catalog

### Core Events

| Event | Source | Payload | Consumers |
|-------|--------|---------|-----------|
| `UserMessageReceived` | Channel Adapter | `{ userId, channel, content, timestamp }` | Runtime |
| `AgentThinking` | Companion Brain | `{ sessionId, phase }` | Monitoring |
| `AgentResponseSent` | Companion Brain | `{ sessionId, content, tokens }` | Memory, Session |
| `MessageStored` | Session | `{ sessionId, messageId, role }` | Presence |
| `ToolCalled` | Companion Brain | `{ sessionId, toolName, args, result }` | Audit, Growth |
| `ToolFailed` | Companion Brain | `{ sessionId, toolName, error }` | Runtime |

### Memory Events

| Event | Source | Payload | Consumers |
|-------|--------|---------|-----------|
| `MemoryCreated` | Memory Engine | `{ userId, type, key, content }` | Companion, Growth |
| `MemoryUpdated` | Memory Engine | `{ userId, type, key, oldContent, newContent }` | Companion |
| `MemoryDeleted` | Memory Engine | `{ userId, type, key }` | Companion |
| `MemoryConflictDetected` | Memory Engine | `{ entries }` | Runtime (for clarification) |
| `ReflectionCompleted` | Reflection | `{ sessionId, extracted }` | Companion, Growth |
| `ContextCompressed` | Context Builder | `{ sessionId, ratio }` | Monitoring |

### Relationship Events

| Event | Source | Payload | Consumers |
|-------|--------|---------|-----------|
| `RelationshipChanged` | Companion Engine | `{ userId, dimension, oldValue, newValue, reason }` | Context, Presence |
| `TrustChanged` | Companion Engine | `{ userId, delta, reason }` | Context |
| `StateTransition` | Companion Engine | `{ userId, from, to, reason }` | Context, Growth |
| `BoundaryEstablished` | Companion Engine | `{ userId, topic, type }` | Runtime |
| `BoundaryViolation` | Companion Engine | `{ userId, topic, count }` | Runtime (auto-recover) |

### Growth Events

| Event | Source | Payload | Consumers |
|-------|--------|---------|-----------|
| `AchievementUnlocked` | Growth Engine | `{ userId, achievementId, name, icon }` | Presence, Context |
| `LevelUp` | Growth Engine | `{ userId, level, title }` | Presence |
| `MilestoneReached` | Growth Engine | `{ userId, milestone, value }` | Presence |
| `GoalUpdated` | Workflow Engine | `{ userId, goalId, progress }` | Context |
| `GoalCompleted` | Workflow Engine | `{ userId, goalId, title }` | Presence, Growth |

### Presence Events

| Event | Source | Payload | Consumers |
|-------|--------|---------|-----------|
| `PresenceTriggered` | Presence Engine | `{ userId, type, message }` | Channel Adapter |
| `ProactiveMessageSent` | Presence Engine | `{ userId, type, success }` | Monitoring |

### System Events

| Event | Source | Payload | Consumers |
|-------|--------|---------|-----------|
| `SessionCreated` | Session | `{ sessionId, userId, channel }` | Monitoring |
| `SessionEnded` | Session | `{ sessionId }` | Memory |
| `ErrorOccurred` | Any | `{ source, error, context }` | Monitoring, Runtime |
| `ProviderRateLimited` | Provider | `{ provider, retryAfter }` | Runtime (backoff) |

---

## Event Flow: Complete Turn

```
1. Channel Adapter
   │
   ├──→ emit UserMessageReceived
   │
2. Runtime
   │
   ├──→ subscribe UserMessageReceived
   ├──→ emit SessionCreated (if new)
   ├──→ call ContextBuilder → emit ContextCompressed (if needed)
   ├──→ call CompanionBrain
   │
3. CompanionBrain
   │
   ├──→ emit AgentThinking(phase: "observe")
   ├──→ emit AgentThinking(phase: "retrieve")
   ├──→ emit AgentThinking(phase: "think")
   ├──→ emit AgentThinking(phase: "execute")
   │
   ├──→ (if tool call) emit ToolCalled
   │   │
   │   └──→ Tool handler → emit ToolResult
   │
   ├──→ emit AgentResponseSent
   │
4. (async) Reflection
   │
   ├──→ emit ReflectionCompleted
   │   │
   │   ├──→ WorkflowEngine subscribes: emit GoalUpdated
   │   ├──→ CompanionEngine subscribes: emit RelationshipChanged
   │   │   │
   │   │   └──→ GrowthEngine subscribes: emit AchievementUnlocked
   │   │                                          emit LevelUp
   │   │
   │   └──→ MemoryEngine subscribes: emit MemoryCreated
   │
5. (async) Presence
   │
   └──→ emit PresenceTriggered
```

---

## Event Bus Implementation

```typescript
class CompanionEventBus implements EventBus {
  private subscribers = new Map<string, Set<EventHandler>>()
  private history: EventRecord[] = []
  private metrics: Map<string, number> = new Map()
  
  async emit(event: Envelope): Promise<void> {
    // Record
    this.history.push({ event, timestamp: Date.now() })
    this.metrics.set(event.type, (this.metrics.get(event.type) ?? 0) + 1)
    
    // Notify (async — don't block caller)
    const handlers = this.subscribers.get(event.type)
    if (handlers) {
      const promises = Array.from(handlers).map(h => 
        h(event).catch(err => 
          console.error(`[EventBus] Handler failed for ${event.type}:`, err)
        )
      )
      await Promise.all(promises)
    }
  }
  
  subscribe<T>(eventType: string, handler: EventHandler<T>): Subscription {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set())
    }
    this.subscribers.get(eventType)!.add(handler as EventHandler)
    return {
      unsubscribe: () => this.subscribers.get(eventType)?.delete(handler as EventHandler)
    }
  }
}
```

---

## Migration Path

### Phase 1: Define Event Types (P0)
```
Create EventCatalog with all event types as typed constants
Create Envelope interface
```

### Phase 2: Replace Callbacks with Events (P0)
```
onBeforeTurn → emit event
onAfterTurn → emit event (reflection triggered by event)
handleToolCall → emit event (tool call execution via event subscription)
```

### Phase 3: Full Event Wiring (P1)
```
CompanionEngine subscribes to MemoryCreated → update relationship
GrowthEngine subscribes to GoalUpdated → check achievements
PresenceEngine subscribes to RelationshipChanged → recalculate initiative
Memory subscribes to UserMessageReceived → trigger reflection
```

### Phase 4: Observability (P2)
```
Event history for debugging
Event metrics for monitoring
Event correlation for tracing
```
