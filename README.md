# Viraha

Infrastructure for long-term AI relationships.

Viraha is an open-source framework for building digital companions that remember, learn, and grow with users over months and years. It is not a generic agent framework; its focus is relationship-aware companions that live in web and social channels.

## Quick Start

```bash
pnpm install
pnpm setup          # interactive wizard: pick platforms, fill credentials, test connection
pnpm web            # start Arete
# http://localhost:3000
```

The `pnpm setup` wizard walks you through connecting Feishu / QQ / LLM providers step by step — like Hermes's `gateway setup`. It shows registration steps for each platform, verifies credentials by testing the connection, and writes `.env` for you. You can also configure manually by copying `.env.example` to `.env`.

You can also set `ANTHROPIC_API_KEY` and use a Claude model via `DEFAULT_MODEL`.

## Project Shape

```text
packages/
  core/          shared types and utilities
  db/            SQLite + drizzle-orm schema and migrations
  provider/      DeepSeek and Anthropic providers
  runtime/       AgentPipeline, EventBus, sessions, tool loop
  memory/        profile, memory store, ranking, reflection
  relationship/  relationship state and prompt enrichment
  embedding/     local embedding provider
  knowledge/     knowledge-pack loading and retrieval
  skills/        skill registry, executor, policy
  channels/      cross-platform channel hub and identity routing
  presence/      proactive messaging
  context/       token budgeting and context assembly
  identity/      companion identity config
  persona/       persona templates
  mcp/           MCP manager

apps/
  arete/         reference fitness companion
```

## The Core Loop

Viraha's reference loop is:

```text
message
  -> stable user id from ChannelHub
  -> memory context
  -> relationship-aware system prompt
  -> LLM + skills
  -> reply
  -> async reflection
  -> updated memory and relationship state
```

The most important working sample is Arete. It wires identity, memory, relationship, knowledge, skills, web UI, and optional Feishu/QQ channels in [apps/arete/src/index.ts](apps/arete/src/index.ts).

## Scripts

```bash
pnpm setup      # interactive setup wizard (platforms + LLM + .env)
pnpm web        # run Arete dev server
pnpm build      # type-check and build every workspace package
pnpm test       # fast local confidence suite
pnpm test:full  # all package tests, including heavier optional suites
pnpm lint       # package type checks
```

## Environment

Set at least one provider key:

```env
DEEPSEEK_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_MODEL=deepseek-chat
```

Optional channels are activated from environment variables. Unconfigured channels are skipped.

### Channel Modes (WebSocket-first, like Hermes)

Both Feishu and QQ adapters default to **WebSocket long-connection mode** — no public URL, no tunnel (ngrok/cloudflared), no signature verification needed. The adapter connects outbound to the platform's WebSocket gateway; the platform pushes events down that connection.

| Platform | Mode | Config | Public URL needed? |
|---|---|---|---|
| Feishu | `websocket` (default) | `FEISHU_APP_ID` + `FEISHU_APP_SECRET` | No |
| Feishu | `webhook` (fallback) | + `FEISHU_ENCRYPT_KEY` + `FEISHU_VERIFICATION_TOKEN` + `FEISHU_WEBHOOK_PORT` | Yes |
| QQ | `websocket` (default with SECRET) | `QQ_BOT_APPID` + `QQ_BOT_SECRET` | No |
| QQ | `push-only` (fallback with TOKEN) | `QQ_BOT_APPID` + `QQ_BOT_TOKEN` | N/A (outbound only) |

Feishu uses the official `@larksuiteoapi/node-sdk` WSClient. QQ implements the official Bot API v2 WebSocket protocol (op=2 Identify, op=1 Heartbeat, op=0 Dispatch with `GROUP_AND_C2C_EVENT` intent).

## Arete: Scope and Boundaries

Arete is a **fitness companion**, not a medical professional or a general-purpose assistant.

- **Can do:** plan workouts, log training and nutrition, analyse progress, suggest recovery habits, remember your goals/injuries/preferences across sessions, search the web for fitness information.
- **Will not do:** diagnose injuries or illnesses, prescribe medication or supplements, provide medical/psychiatric treatment, facilitate self-harm. On crisis signals it responds with care and points to professional help.
- **Where data lives:** conversations, memory, and relationships are stored in a local SQLite file (`data/arete.db`) on the machine running the server. When you configure a real LLM provider (DeepSeek/Anthropic), message text is sent to that provider's API for generation; no other data leaves the machine unless a channel (Feishu/QQ) is configured and used.

### Privacy & Data Boundaries

- **Per-user isolation:** the Web UI derives a stable identity from an httpOnly cookie. Profile, memory, relationship state, and trace events are always scoped to that identity — `/api/events` and `/api/traces` ignore any client-supplied `userId` and only ever return the caller's own data.
- **You can export your data:** `GET /api/data/export` returns your profile, memories, session summaries, relationship state, and trace events as a single JSON document.
- **You can delete your data:** `DELETE /api/data` erases everything stored under your identity (per-user tables, cascaded messages/plans, channel bindings, and the user record). After deletion, the same queries return nothing. Deleting one user never touches another user's data.
- **Log / trace sanitization:** before any event reaches the SQLite event store, known secret patterns (Provider API keys like `sk-…`, `Bearer` tokens, `Authorization` headers, the `viraha_web_id` cookie, channel signatures such as `x-lark-signature`) are redacted to `[redacted]`. Ordinary message text is never redacted.
- **External data flow:** the only outbound data is the conversation text sent to your configured LLM provider (DeepSeek/Anthropic) for generation, and webhook callbacks to configured channels (Feishu/QQ) for replies. The provider receives message text, not the local SQLite database.

## Direction

The near-term goal is not to copy large agent frameworks feature-for-feature. The goal is to make Arete a real proof that a companion can remember constraints, adapt to relationship history, and stay useful across weeks of interaction.

Stage 0 success means:

- `pnpm web` starts cleanly.
- A user can chat with Arete in the browser.
- Arete can log training and nutrition through skills.
- Arete remembers explicit goals, preferences, and injuries across sessions.
- Relationship state is updated after successful turns.
- The fast test suite stays green.
