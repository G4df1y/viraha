import { describe, expect, it } from "vitest";

import {
  ManualClock,
  defineCapability,
} from "@viraha/companion-core";
import type { IdentityConfig } from "@viraha/identity";
import type { LLMProvider } from "@viraha/provider";
import {
  AgentPipeline,
  CapabilityRuntime,
  EventBus,
  InMemoryCapabilityGrantStore,
  InMemoryCapabilityObservationSink,
} from "../src/index.js";

const identity: IdentityConfig = {
  agentId: "arete",
  name: "Arete",
  version: "0.0.0-test",
  type: "companion",
  description: "The first Viraha seed",
  coreValues: ["dignity", "honesty"],
  boundaries: [],
  capabilities: [],
  skills: [],
  personaId: "arete-default",
  persona: {
    name: "Arete",
    traits: ["honest"],
    style: "calm",
    humorLevel: 0,
    formality: 0.5,
    empathyLevel: 0.7,
  },
};

function fakeToolCallingModel(): LLMProvider {
  let calls = 0;
  return {
    name: "fake",
    async chat(params) {
      calls += 1;
      if (calls === 1) {
        expect(params.tools?.map(tool => tool.name)).toContain(
          "cap_community_echo",
        );
        return {
          content: "",
          finishReason: "tool_use",
          toolCalls: [
            {
              id: "tool-call-1",
              name: "cap_community_echo",
              arguments: { text: "hello" },
            },
          ],
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      }
      return {
        content: params.messages.at(-1)?.content ?? "",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    },
    async *chatStream() {},
  };
}

describe("AgentPipeline Capability integration", () => {
  it("executes a granted Capability and emits invocation audit events", async () => {
    const clock = new ManualClock("2026-07-13T00:00:00.000Z");
    const grants = new InMemoryCapabilityGrantStore();
    const observations = new InMemoryCapabilityObservationSink();
    const capabilities = new CapabilityRuntime({ clock, grants, observations });
    capabilities.install(
      defineCapability({
        schemaVersion: 1,
        id: "community.echo",
        version: "1.0.0",
        name: "Echo",
        description: "Echo selected text.",
        author: "Viraha Community",
        license: "Apache-2.0",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        permissions: [
          {
            id: "response.act",
            kind: "act",
            reason: "Return text to this conversation.",
            required: true,
          },
        ],
        sideEffect: "none",
        risk: "low",
      }),
      async input => ({ content: String(input.text), sideEffects: [] }),
    );
    await capabilities.grant({
      capabilityId: "community.echo",
      permissionId: "response.act",
      userId: "user-1",
      scope: "always",
    });

    const events = new EventBus(clock);
    const pipeline = new AgentPipeline({
      identity,
      model: "fake-model",
      llm: fakeToolCallingModel(),
      clock,
      events,
      capabilities,
    });

    const result = await pipeline.process({
      message: "echo hello",
      userId: "user-1",
      userIdKind: "internal",
      channel: "mobile",
    });

    expect(result.reply).toContain("hello");
    expect(observations.items[0]?.outcome).toBe("completed");
    expect(events.getHistory().map(event => event.type)).toContain(
      "CapabilityCompleted",
    );
  });
});
