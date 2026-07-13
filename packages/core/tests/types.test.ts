import { describe, it, expect } from "vitest"
import { MessageRole, type EventType } from "../src/types.js"

describe("MessageRole", () => {
  it("parses valid roles", () => {
    expect(MessageRole.parse("user")).toBe("user")
    expect(MessageRole.parse("assistant")).toBe("assistant")
    expect(MessageRole.parse("tool")).toBe("tool")
  })

  it("rejects invalid roles", () => {
    expect(() => MessageRole.parse("admin")).toThrow()
  })
})

describe("EventEnvelope structure", () => {
  it("requires type from EventType union", () => {
    const event: { type: string } = { type: "UserMessageReceived" }
    expect(event.type).toBe("UserMessageReceived")
  })

  it("accepts all EventType values", () => {
    const types = [
      "UserMessageReceived",
      "AgentThinking",
      "AgentResponseSent",
      "MessageStored",
      "ToolCalled",
      "ToolFailed",
      "MemoryCreated",
      "MemoryUpdated",
      "ReflectionCompleted",
      "RelationshipChanged",
      "TrustChanged",
      "StateTransition",
      "AchievementUnlocked",
      "LevelUp",
      "GoalUpdated",
      "GoalCompleted",
      "PresenceTriggered",
      "SessionCreated",
      "SessionEnded",
      "ErrorOccurred",
      "SafetyBoundaryTriggered",
      "ChannelMessageSent",
      "ChannelSendFailed",
      "CapabilityInvoked",
      "CapabilityCompleted",
      "CapabilityDenied",
      "CapabilityFailed",
    ] satisfies EventType[]
    types.forEach(t => expect(t).toBeTruthy())
  })
})

