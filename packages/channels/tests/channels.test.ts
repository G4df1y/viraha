import { describe, it, expect, beforeEach, afterEach } from "vitest"
import os from "os"
import path from "path"
import fs from "fs"
import crypto from "crypto"

import { migrate, initDb, closeDb, getDb } from "@viraha/db"
import { ChannelHub, BaseAdapter, FeishuAdapter, QQAdapter } from "../src/index.js"
import type { IncomingMessage, OutgoingMessage, ChannelOutboundEvent } from "../src/index.js"
import { verifyFeishuSignature, parseFeishuMessageEvent } from "../src/adapters/feishu.js"
import { parseQQMessageEvent } from "../src/adapters/qq.js"

// ===== Mock adapter（用于 hub 测试，不依赖真实平台）=====
class MockAdapter extends BaseAdapter {
  readonly platform: string
  private startCalled = false
  private stopCalled = false
  sent: OutgoingMessage[] = []

  constructor(platform: string) {
    super()
    this.platform = platform
  }

  protected async doStart(): Promise<void> {
    this.startCalled = true
  }
  protected async doStop(): Promise<void> {
    this.stopCalled = true
  }
  async send(message: OutgoingMessage): Promise<boolean> {
    this.sent.push(message)
    return true
  }

  /** 测试用：模拟收到一条入站消息 */
  async receive(msg: IncomingMessage): Promise<void> {
    await this.emit(msg)
  }

  get wasStarted() { return this.startCalled }
  get wasStopped() { return this.stopCalled }
}

function tempDbPath(): string {
  return path.join(os.tmpdir(), `channels-test-${crypto.randomUUID()}.db`)
}

describe("ChannelHub", () => {
  it("register + discover + startAll activates configured adapters", async () => {
    const hub = new ChannelHub()
    const mock = new MockAdapter("test-platform")
    hub.register("test-platform", () => mock)

    const discovered = hub.discover()
    expect(discovered).toEqual(["test-platform"])
    expect(hub.activePlatforms).toEqual(["test-platform"])

    await hub.startAll()
    expect(mock.wasStarted).toBe(true)
  })

  it("factory returning null is skipped (unconfigured platform)", () => {
    const hub = new ChannelHub()
    hub.register("unconfigured", () => null)
    const discovered = hub.discover()
    expect(discovered).toEqual([])
    expect(hub.activePlatforms).toEqual([])
  })

  it("inbound message fans out to all registered handlers", async () => {
    const hub = new ChannelHub()
    const mock = new MockAdapter("test")
    hub.register("test", () => mock)
    hub.discover()

    const received: IncomingMessage[] = []
    hub.onMessage(async (msg) => { received.push(msg) })
    hub.onMessage(async (msg) => { received.push({ ...msg, text: msg.text + " (handler 2)" }) })

    await hub.startAll()
    await mock.receive({
      platform: "test",
      platformUserId: "user-1",
      text: "hello",
    })

    expect(received.length).toBe(2)
    expect(received[0].text).toBe("hello")
    expect(received[1].text).toBe("hello (handler 2)")
  })

  it("reply routes to the correct adapter", async () => {
    const hub = new ChannelHub()
    const mock1 = new MockAdapter("platform-a")
    const mock2 = new MockAdapter("platform-b")
    hub.register("platform-a", () => mock1)
    hub.register("platform-b", () => mock2)
    await hub.startAll()

    await hub.reply("platform-b", "user-x", "hi from B")
    expect(mock1.sent.length).toBe(0)
    expect(mock2.sent.length).toBe(1)
    expect(mock2.sent[0].text).toBe("hi from B")
  })

  it("handler error is isolated (one handler throwing doesn't block others)", async () => {
    const hub = new ChannelHub()
    const mock = new MockAdapter("test")
    hub.register("test", () => mock)
    hub.discover()

    let secondCalled = false
    hub.onMessage(async () => { throw new Error("boom") })
    hub.onMessage(async () => { secondCalled = true })

    await hub.startAll()
    await mock.receive({ platform: "test", platformUserId: "u", text: "x" })
    expect(secondCalled).toBe(true)
  })

  it("stopAll stops all adapters", async () => {
    const hub = new ChannelHub()
    const mock = new MockAdapter("test")
    hub.register("test", () => mock)
    await hub.startAll()

    await hub.stopAll()
    expect(mock.wasStopped).toBe(true)
  })
})

describe("ChannelRouter", () => {
  let dbPath: string

  beforeEach(async () => {
    dbPath = tempDbPath()
    await migrate(dbPath)
    initDb(dbPath)
    // 确保 channel_bindings 表存在（防御性：migrate split 逻辑可能漏掉）
    const db = getDb()
    await db.run(`
      CREATE TABLE IF NOT EXISTS channel_bindings (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        platform_user_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL,
        last_seen_at TEXT
      )
    `)
    await db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_bindings_platform_user
        ON channel_bindings(platform, platform_user_id)
    `)
  })

  afterEach(() => {
    closeDb()
    try { fs.unlinkSync(dbPath) } catch {}
    try { fs.unlinkSync(dbPath + "-wal") } catch {}
    try { fs.unlinkSync(dbPath + "-shm") } catch {}
  })

  it("resolveUserId creates binding on first call, returns same id on subsequent", async () => {
    const hub = new ChannelHub()
    const id1 = await hub.router.resolveUserId("feishu", "ou_abc123")
    const id2 = await hub.router.resolveUserId("feishu", "ou_abc123")

    expect(id1).toBe(id2)
    expect(typeof id1).toBe("string")
    expect(id1.length).toBeGreaterThan(0)
  })

  it("different platform users get different internal ids", async () => {
    const hub = new ChannelHub()
    const a = await hub.router.resolveUserId("feishu", "ou_a")
    const b = await hub.router.resolveUserId("feishu", "ou_b")
    const c = await hub.router.resolveUserId("qq", "ou_a") // 同 platformUserId 不同 platform

    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })

  it("linkPlatform merges two platform identities into one userId", async () => {
    const hub = new ChannelHub()
    // 用户先用 web 聊，再用飞书聊，得到两个 userId
    const webUserId = await hub.router.resolveUserId("web", "cookie-abc")
    const feishuUserId = await hub.router.resolveUserId("feishu", "ou_feishu_1")
    expect(webUserId).not.toBe(feishuUserId)

    // 绑定：把飞书身份合并到 web userId
    await hub.router.linkPlatform(webUserId, "feishu", "ou_feishu_1")

    // 之后从飞书来，应该返回 web userId（合并成功）
    const afterLink = await hub.router.resolveUserId("feishu", "ou_feishu_1")
    expect(afterLink).toBe(webUserId)

    // 两个平台的 binding 都挂在同一个 userId 下
    const bindings = await hub.router.listBindingsByUser(webUserId)
    expect(bindings.length).toBe(2)
    expect(bindings.some(b => b.platform === "web" && b.platformUserId === "cookie-abc")).toBe(true)
    expect(bindings.some(b => b.platform === "feishu" && b.platformUserId === "ou_feishu_1")).toBe(true)
  })

  it("token-based binding: createLinkToken + consumeLinkToken merges identity", async () => {
    const hub = new ChannelHub()
    // 用户在 web 聊，得到 web userId
    const webUserId = await hub.router.resolveUserId("web", "cookie-xyz")

    // web 生成绑定 token
    const token = hub.router.createLinkToken(webUserId)
    expect(token.length).toBe(6)
    expect(token).toMatch(/^[A-Z0-9]+$/)

    // 用户在飞书发 "/bind <token>"，消费 token 合并身份
    const mergedUserId = await hub.router.consumeLinkToken(token, "feishu", "ou_feishu_2")
    expect(mergedUserId).toBe(webUserId)

    // 之后从飞书来，应该返回 web userId
    const afterBind = await hub.router.resolveUserId("feishu", "ou_feishu_2")
    expect(afterBind).toBe(webUserId)

    // token 是一次性的：再用应该失败
    const reuse = await hub.router.consumeLinkToken(token, "feishu", "ou_feishu_3")
    expect(reuse).toBeNull()

    // 无效 token 也失败
    const invalid = await hub.router.consumeLinkToken("NOTEXIST", "feishu", "ou_feishu_4")
    expect(invalid).toBeNull()
  })

  it("listActiveUsers orders by lastSeenAt DESC at SQL level (not just in-memory)", async () => {
    const hub = new ChannelHub()
    const target = await hub.router.resolveUserId("test", "target-pu")
    await new Promise(r => setTimeout(r, 10))
    const newest = await hub.router.resolveUserId("test", "newest-pu")
    await new Promise(r => setTimeout(r, 10))
    const middle = await hub.router.resolveUserId("test", "middle-pu")
    await new Promise(r => setTimeout(r, 10))
    const oldest = await hub.router.resolveUserId("test", "oldest-pu")

    const fillerUserIds: string[] = []
    for (let i = 0; i < 20; i++) {
      const id = await hub.router.resolveUserId("filler", `filler-${i}`)
      fillerUserIds.push(id)
      await new Promise(r => setTimeout(r, 2))
    }

    await hub.router.touch("test", "oldest-pu")
    await new Promise(r => setTimeout(r, 10))
    await hub.router.touch("test", "middle-pu")
    await new Promise(r => setTimeout(r, 10))
    await hub.router.touch("test", "newest-pu")

    const users = await hub.router.listActiveUsers(3)
    expect(users.map(u => u.userId)).toEqual([newest, middle, oldest])
  })

  it("keeps distinct active users when one user has many bindings", async () => {
    const hub = new ChannelHub()
    const crowded = await hub.router.resolveUserId("test", "crowded-0")
    await hub.router.resolveUserId("test", "other-0")
    await hub.router.resolveUserId("test", "other-1")

    for (let i = 1; i < 8; i++) {
      await hub.router.linkPlatform(crowded, "test", `crowded-${i}`)
    }

    const users = await hub.router.listActiveUsers(3)
    expect(users.map(u => u.userId)).toContain(crowded)
    expect(new Set(users.map(u => u.userId)).size).toBe(3)
  })
})

describe("FeishuAdapter.fromEnv", () => {
  beforeEach(() => {
    delete process.env.FEISHU_APP_ID
    delete process.env.FEISHU_APP_SECRET
    delete process.env.FEISHU_CONNECTION_MODE
    delete process.env.FEISHU_ENCRYPT_KEY
    delete process.env.FEISHU_VERIFICATION_TOKEN
    delete process.env.FEISHU_WEBHOOK_PORT
  })

  it("returns null when env not configured", () => {
    expect(FeishuAdapter.fromEnv()).toBeNull()
  })

  it("returns adapter when env configured", () => {
    process.env.FEISHU_APP_ID = "cli_test"
    process.env.FEISHU_APP_SECRET = "secret"
    const adapter = FeishuAdapter.fromEnv()
    expect(adapter).not.toBeNull()
    expect(adapter!.platform).toBe("feishu")
  })

  it("defaults to websocket mode when FEISHU_CONNECTION_MODE not set", () => {
    process.env.FEISHU_APP_ID = "cli_test"
    process.env.FEISHU_APP_SECRET = "secret"
    const adapter = FeishuAdapter.fromEnv()!
    expect(adapter.connectionMode).toBe("websocket")
  })

  it("uses webhook mode when FEISHU_CONNECTION_MODE=webhook", () => {
    process.env.FEISHU_APP_ID = "cli_test"
    process.env.FEISHU_APP_SECRET = "secret"
    process.env.FEISHU_CONNECTION_MODE = "webhook"
    const adapter = FeishuAdapter.fromEnv()!
    expect(adapter.connectionMode).toBe("webhook")
  })

  it("uses websocket mode when FEISHU_CONNECTION_MODE=websocket explicitly", () => {
    process.env.FEISHU_APP_ID = "cli_test"
    process.env.FEISHU_APP_SECRET = "secret"
    process.env.FEISHU_CONNECTION_MODE = "WEBSOCKET" // 大写也接受
    const adapter = FeishuAdapter.fromEnv()!
    expect(adapter.connectionMode).toBe("websocket")
  })
})

describe("FeishuAdapter webhook challenge", () => {
  it("responds to url_verification with the challenge token", async () => {
    // 直接测 doStart + 发 challenge 请求
    process.env.FEISHU_APP_ID = "cli_test"
    process.env.FEISHU_APP_SECRET = "secret"
    process.env.FEISHU_CONNECTION_MODE = "webhook"
    process.env.FEISHU_WEBHOOK_PORT = "3099"
    const adapter = FeishuAdapter.fromEnv()!
    await adapter.start()

    try {
      const challenge = "verify_token_abc"
      const res = await fetch("http://localhost:3099/webhook/feishu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "url_verification", challenge }),
      })
      const data = await res.json() as { challenge: string }
      expect(data.challenge).toBe(challenge)
    } finally {
      await adapter.stop()
    }
  })
})

describe("QQAdapter.fromEnv", () => {
  beforeEach(() => {
    delete process.env.QQ_BOT_APPID
    delete process.env.QQ_BOT_SECRET
    delete process.env.QQ_BOT_CLIENT_SECRET
    delete process.env.QQ_BOT_TOKEN
    delete process.env.QQ_GROUP_OPENID
  })

  it("returns null when env not configured", () => {
    expect(QQAdapter.fromEnv()).toBeNull()
  })

  it("returns push-only adapter with just APPID + TOKEN", () => {
    process.env.QQ_BOT_APPID = "app123"
    process.env.QQ_BOT_TOKEN = "tok456"
    const adapter = QQAdapter.fromEnv()!
    expect(adapter).not.toBeNull()
    expect(adapter.platform).toBe("qq")
    expect(adapter.connectionMode).toBe("push-only")
  })

  it("returns websocket adapter with APPID + SECRET", () => {
    process.env.QQ_BOT_APPID = "app123"
    process.env.QQ_BOT_SECRET = "secret456"
    const adapter = QQAdapter.fromEnv()!
    expect(adapter).not.toBeNull()
    expect(adapter.connectionMode).toBe("websocket")
  })

  it("accepts QQ_BOT_CLIENT_SECRET as alias for QQ_BOT_SECRET", () => {
    process.env.QQ_BOT_APPID = "app123"
    process.env.QQ_BOT_CLIENT_SECRET = "client-secret-789"
    const adapter = QQAdapter.fromEnv()!
    expect(adapter.connectionMode).toBe("websocket")
  })
})

// ===== P0.1: QQ 消息事件解析（纯函数）=====
describe("parseQQMessageEvent", () => {
  const groupAtMessage = {
    op: 0,
    s: 42,
    t: "GROUP_AT_MESSAGE_CREATE",
    d: {
      id: "msg_001",
      content: "<@!123456> 你好 Arete",
      author: { id: "user_openid_abc", member_openid: "member_xyz" },
      group_openid: "group_openid_001",
    },
  }

  const c2cMessage = {
    op: 0,
    s: 43,
    t: "C2C_MESSAGE_CREATE",
    d: {
      id: "msg_002",
      content: "今天做什么训练",
      author: { user_openid: "user_openid_def", union_openid: "union_uvw" },
    },
  }

  it("parses GROUP_AT_MESSAGE_CREATE, strips @bot prefix", () => {
    const incoming = parseQQMessageEvent(groupAtMessage)
    expect(incoming).not.toBeNull()
    expect(incoming!.platform).toBe("qq")
    expect(incoming!.text).toBe("你好 Arete") // @bot 前缀被去掉
    expect(incoming!.platformChatId).toBe("group_openid_001")
    expect(incoming!.raw).toBe(groupAtMessage)
  })

  it("parses C2C_MESSAGE_CREATE (direct message)", () => {
    const incoming = parseQQMessageEvent(c2cMessage)
    expect(incoming).not.toBeNull()
    expect(incoming!.text).toBe("今天做什么训练")
    expect(incoming!.platformChatId).toBeUndefined()
  })

  it("returns null for non-Dispatch op (e.g. op=10 Hello)", () => {
    const hello = { op: 10, d: { heartbeat_interval: 45000 } }
    expect(parseQQMessageEvent(hello)).toBeNull()
  })

  it("returns null for non-message events (e.g. READY)", () => {
    const ready = { op: 0, s: 1, t: "READY", d: { session_id: "x" } }
    expect(parseQQMessageEvent(ready)).toBeNull()
  })

  it("returns null when content is empty after @strip", () => {
    const empty = {
      ...groupAtMessage,
      d: { ...groupAtMessage.d, content: "<@!123456>   " },
    }
    expect(parseQQMessageEvent(empty)).toBeNull()
  })

  it("returns null when author id missing", () => {
    const noAuthor = {
      ...groupAtMessage,
      d: { ...groupAtMessage.d, author: {} },
    }
    expect(parseQQMessageEvent(noAuthor)).toBeNull()
  })
})

// ===== P0.1: 出站发送回执（ChannelHub.reply → eventSink → Trace）=====
describe("ChannelHub outbound receipt", () => {
  it("emits sent event on successful send", async () => {
    const hub = new ChannelHub()
    const mock = new MockAdapter("test")
    hub.register("test", () => mock)
    await hub.startAll()

    const events: ChannelOutboundEvent[] = []
    hub.setEventSink(async (e) => { events.push(e) })

    const ok = await hub.reply("test", "u1", "hello")
    expect(ok).toBe(true)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe("sent")
    expect(events[0].platform).toBe("test")
    expect(events[0].platformUserId).toBe("u1")
    expect(events[0].textSnippet).toBe("hello")
  })

  it("emits failed event when adapter throws", async () => {
    const hub = new ChannelHub()
    class ThrowingAdapter extends MockAdapter {
      constructor() { super("throw") }
      async send(): Promise<boolean> { throw new Error("network down") }
    }
    hub.register("throw", () => new ThrowingAdapter())
    await hub.startAll()

    const events: ChannelOutboundEvent[] = []
    hub.setEventSink(async (e) => { events.push(e) })

    const ok = await hub.reply("throw", "u1", "hello")
    expect(ok).toBe(false)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe("failed")
    expect(events[0].error).toContain("network down")
  })

  it("emits failed event when adapter returns false", async () => {
    const hub = new ChannelHub()
    class FailAdapter extends MockAdapter {
      constructor() { super("fail") }
      async send(): Promise<boolean> { return false }
    }
    hub.register("fail", () => new FailAdapter())
    await hub.startAll()

    const events: ChannelOutboundEvent[] = []
    hub.setEventSink(async (e) => { events.push(e) })

    const ok = await hub.reply("fail", "u1", "hello")
    expect(ok).toBe(false)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe("failed")
  })

  it("does not crash when no eventSink configured", async () => {
    const hub = new ChannelHub()
    const mock = new MockAdapter("test")
    hub.register("test", () => mock)
    await hub.startAll()
    const ok = await hub.reply("test", "u1", "hello")
    expect(ok).toBe(true)
  })

  it("truncates textSnippet to 80 chars", async () => {
    const hub = new ChannelHub()
    const mock = new MockAdapter("test")
    hub.register("test", () => mock)
    await hub.startAll()

    const events: ChannelOutboundEvent[] = []
    hub.setEventSink(async (e) => { events.push(e) })

    const longText = "x".repeat(200)
    await hub.reply("test", "u1", longText)
    expect(events[0].textSnippet.length).toBe(80)
  })
})

// ===== P0.1: 飞书入站签名校验（透明可审阅，非黑盒）=====
describe("FeishuAdapter signature verification", () => {
  const body = JSON.stringify({ type: "url_verification", challenge: "x" })
  const encryptKey = "test-encrypt-key"
  const timestamp = "1234567890"
  const nonce = "abc"
  const validSignature = crypto
    .createHash("sha256")
    .update(timestamp + nonce + encryptKey + body)
    .digest("hex")

  it("rejects when encryptKey configured but signature header missing", () => {
    const result = verifyFeishuSignature({ encryptKey, headers: {}, body })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe("missing-signature-headers")
  })

  it("rejects when encryptKey configured but timestamp header missing", () => {
    const result = verifyFeishuSignature({
      encryptKey,
      headers: { "x-lark-signature": validSignature, "x-lark-request-nonce": nonce },
      body,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe("missing-signature-headers")
  })

  it("rejects when signature mismatch", () => {
    const result = verifyFeishuSignature({
      encryptKey,
      headers: {
        "x-lark-signature": "deadbeef",
        "x-lark-request-timestamp": timestamp,
        "x-lark-request-nonce": nonce,
      },
      body,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe("signature-mismatch")
  })

  it("accepts valid signature", () => {
    const result = verifyFeishuSignature({
      encryptKey,
      headers: {
        "x-lark-signature": validSignature,
        "x-lark-request-timestamp": timestamp,
        "x-lark-request-nonce": nonce,
      },
      body,
    })
    expect(result.ok).toBe(true)
  })

  it("passes through when no encryptKey configured", () => {
    const result = verifyFeishuSignature({ encryptKey: undefined, headers: {}, body })
    expect(result.ok).toBe(true)
  })
})

// ===== P0.1: 飞书消息事件解析（WS 和 webhook 共用的纯函数）=====
describe("parseFeishuMessageEvent", () => {
  const validPayload = {
    schema: "2.0",
    header: {
      event_id: "e1",
      event_type: "im.message.receive_v1",
      create_time: "1700000000000",
      token: "tok",
      app_id: "cli_x",
      tenant_key: "t",
    },
    event: {
      sender: {
        sender_id: { open_id: "ou_sender_123", union_id: "on_x", user_id: "u" },
        sender_type: "user",
      },
      message: {
        message_id: "om_msg1",
        root_id: "om_msg1",
        parent_id: "om_msg1",
        create_time: "1700000000000",
        chat_id: "oc_chat1",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "你好 Arete" }),
      },
    },
  }

  it("parses a valid text message event", () => {
    const incoming = parseFeishuMessageEvent(validPayload)
    expect(incoming).not.toBeNull()
    expect(incoming!.platform).toBe("feishu")
    expect(incoming!.platformUserId).toBe("ou_sender_123")
    expect(incoming!.text).toBe("你好 Arete")
    expect(incoming!.platformChatId).toBe("oc_chat1")
    expect(incoming!.timestamp).toBe(new Date(1700000000000).toISOString())
  })

  it("returns null for non-message events", () => {
    const payload = { ...validPayload, header: { event_type: "contact.user.updated_v3" } }
    expect(parseFeishuMessageEvent(payload)).toBeNull()
  })

  it("returns null for non-text messages (image/file)", () => {
    const payload = {
      ...validPayload,
      event: { ...validPayload.event, message: { ...validPayload.event.message, message_type: "image" } },
    }
    expect(parseFeishuMessageEvent(payload)).toBeNull()
  })

  it("returns null when sender open_id missing", () => {
    const payload = {
      ...validPayload,
      event: { ...validPayload.event, sender: { sender_id: {} } },
    }
    expect(parseFeishuMessageEvent(payload)).toBeNull()
  })

  it("returns null for empty text", () => {
    const payload = {
      ...validPayload,
      event: {
        ...validPayload.event,
        message: { ...validPayload.event.message, content: JSON.stringify({ text: "   " }) },
      },
    }
    expect(parseFeishuMessageEvent(payload)).toBeNull()
  })

  it("returns null for malformed content JSON", () => {
    const payload = {
      ...validPayload,
      event: {
        ...validPayload.event,
        message: { ...validPayload.event.message, content: "not-json{[" },
      },
    }
    expect(parseFeishuMessageEvent(payload)).toBeNull()
  })

  it("preserves raw payload in incoming.raw for debugging", () => {
    const incoming = parseFeishuMessageEvent(validPayload)
    expect(incoming!.raw).toBe(validPayload)
  })
})
