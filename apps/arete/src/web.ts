import { Hono } from "hono"
import type { Context } from "hono"
import { serve } from "@hono/node-server"
import { getCookie, setCookie } from "hono/cookie"
import { AgentWorkRunner, type AgentPipeline, type DurableScheduler, type EventBus, type EventStore } from "@viraha/runtime"
import { MCPManager } from "@viraha/mcp"
import type { ChannelHub } from "@viraha/channels"
import type { MemoryEngine } from "@viraha/memory"
import type { CompanionEngine } from "@viraha/relationship"
import type { EmotionEngine } from "@viraha/emotion"
import type { JournalEngine } from "@viraha/journal"
import { exportUserData, deleteUserData } from "./data-privacy.js"
import crypto from "crypto"

export function createAreteApp(
  pipeline: AgentPipeline,
  mcp?: MCPManager,
  knowledge?: (query: string) => Promise<string>,
  hub?: ChannelHub,
  events?: EventBus,
  eventStore?: EventStore,
  workRunner = new AgentWorkRunner(),
  providerHealth?: () => unknown,
  scheduler?: DurableScheduler,
  memory?: MemoryEngine,
  companion?: CompanionEngine,
  emotion?: EmotionEngine,
  journal?: JournalEngine,
) {
  const app = new Hono()

  app.get("/", (c) => c.html(getHtml()))

  // 获取或创建 web 用户的稳定身份（cookie），让 web 和其他平台共享同一份记忆
  async function resolveWebUserId(c: Context): Promise<string> {
    if (!hub) return "web-user" // 未接 hub 时 fallback 到旧行为
    let webId = getCookie(c, "viraha_web_id")
    if (!webId) {
      webId = crypto.randomUUID()
      setCookie(c, "viraha_web_id", webId, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 365, // 1 年
        sameSite: "Lax",
      })
    }
    return hub.router.resolveUserId("web", webId)
  }
  app.get("/api/status", async (c) => {
    const identity = pipeline.identityEngine.get("arete")
    const skills = pipeline.skillsRegistry.list().map(s => s.manifest.name)
    const mcpTools = mcp ? mcp.listTools().flatMap(s => s.tools.map(t => `${s.serverId}:${t.name}`)) : []

    return c.json({
      identity: identity ? { name: identity.name, version: identity.version, type: identity.type } : null,
      skills,
      mcp: mcpTools,
    })
  })

  // SSE streaming endpoint
  app.get("/api/chat/stream", async (c) => {
    const message = c.req.query("message")
    if (!message) return c.json({ error: "Message required" }, 400)

    const userId = await resolveWebUserId(c)

    c.header("Content-Type", "text/event-stream")
    c.header("Cache-Control", "no-cache")
    c.header("Connection", "keep-alive")
    c.header("Access-Control-Allow-Origin", "*")

    const searchFn = async (query: string) => {
      try {
        const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`)
        const data: any = await res.json()
        return data.AbstractText ?? ""
      } catch { return "" }
    }

    // Stream pipeline events as SSE using Web Streams API
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of pipeline.processStream({ message, userId, userIdKind: hub ? "internal" : "external", channel: "web", search: searchFn, knowledge })) {
            const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
            controller.enqueue(encoder.encode(data))
          }
        } catch (err: any) {
          const data = `event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`
          controller.enqueue(encoder.encode(data))
        }
        controller.close()
      },
    })

    return c.body(stream)
  })

  // Per-user chat traces — stored with the requesting user's id so the list
  // can be scoped to the caller. Never expose another user's trace metadata.
  const traces: Array<{ start: string; intent: string; tokens: number; ms: number; userId: string }> = []

  app.post("/api/chat", async (c) => {
    try {
      const { message, history } = await c.req.json() as any
      if (!message) return c.json({ error: "Message required" }, 400)

      const userId = await resolveWebUserId(c)
      const start = Date.now()
      const result = await workRunner.run({ userId, channel: "web", content: message }, () =>
        pipeline.process({
          message,
          userId,
          userIdKind: hub ? "internal" : "external",
          channel: "web",
          history: history ?? [],
          knowledge,
          search: async (query) => {
            try {
              const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`)
              const data: any = await res.json()
              return data.AbstractText ?? ""
            } catch { return "" }
          },
        })
      )

      const ms = Date.now() - start
      traces.push({ start: new Date().toISOString(), intent: "chat", tokens: result.tokensUsed, ms, userId })
      if (traces.length > 100) traces.shift()

      return c.json({ reply: result.reply })
    } catch (err: any) {
      return c.json({ reply: `Error: ${err.message}`, intent: "unknown", tokens: 0 }, 500)
    }
  })

  app.get("/api/traces", async (c) => {
    const userId = await resolveWebUserId(c)
    return c.json({
      // only the caller's own traces are returned
      recent: traces.filter(t => t.userId === userId).slice(-20),
      events: events?.getMetrics() ?? null,
    })
  })

  // ===== 情绪状态 =====
  app.get("/api/mood", async (c) => {
    if (!emotion) return c.json({ error: "Emotion engine not enabled" }, 404)
    const userId = await resolveWebUserId(c)
    const state = await emotion.getState(userId)
    const recent = await emotion.getRecent(userId, 10)
    return c.json({ state, recent })
  })

  app.post("/api/mood", async (c) => {
    if (!emotion) return c.json({ error: "Emotion engine not enabled" }, 404)
    const userId = await resolveWebUserId(c)
    const { mood, intensity, context } = await c.req.json() as any
    if (!mood) return c.json({ error: "mood required" }, 400)
    const record = await emotion.record(userId, mood, intensity ?? 3, context, "explicit")
    return c.json({ ok: true, record })
  })

  // ===== 日记 =====
  app.get("/api/journal", async (c) => {
    if (!journal) return c.json({ error: "Journal engine not enabled" }, 404)
    const userId = await resolveWebUserId(c)
    const date = c.req.query("date")
    if (date) {
      return c.json({ entries: await journal.getByDate(userId, date) })
    }
    return c.json({ entries: await journal.getRecent(userId, 7) })
  })

  app.post("/api/journal", async (c) => {
    if (!journal) return c.json({ error: "Journal engine not enabled" }, 404)
    const userId = await resolveWebUserId(c)
    const { content, moodTags, date } = await c.req.json() as any
    if (!content) return c.json({ error: "content required" }, 400)
    const entry = await journal.writeUserEntry(userId, content, moodTags, date)
    return c.json({ ok: true, entry })
  })

  app.get("/api/events", async (c) => {
    const limit = parseLimit(c.req.query("limit"), 100, 500)
    const type = c.req.query("type") ?? undefined
    // Privacy: the userId is ALWAYS derived from the cookie, never from a
    // query param, so one user cannot query another user's events (IDOR).
    const userId = await resolveWebUserId(c)
    const correlationId = c.req.query("correlationId") ?? undefined

    const rows = eventStore
      ? await eventStore.query({ type, userId, correlationId, limit })
      : (events?.getHistory({ type, userId, limit: 500 }) ?? [])
        .filter(e => !correlationId || e.correlationId === correlationId)
        .slice(-limit)

    return c.json({
      events: rows.map(e => ({
        id: e.id,
        type: e.type,
        source: e.source,
        timestamp: e.timestamp,
        correlationId: e.correlationId,
        userId: e.metadata.userId,
        sessionId: e.metadata.sessionId,
        priority: e.metadata.priority,
        payload: e.payload,
      })),
    })
  })
  app.get("/api/provider-health", (c) => c.json(providerHealth?.() ?? {}))

  app.get("/api/scheduler-stats", async (c) => {
    if (!scheduler) return c.json({ enabled: false })
    return c.json({ enabled: true, ...(await scheduler.getStats()) })
  })

  // 查看当前用户身份 + 已绑定的所有平台
  app.get("/api/identity", async (c) => {
    if (!hub) return c.json({ userId: "web-user", bindings: [] })
    const userId = await resolveWebUserId(c)
    const bindings = await hub.router.listBindingsByUser(userId)
    return c.json({ userId, bindings })
  })

  // 跨平台绑定：把另一个平台身份合并到当前 web 用户
  // POST /api/link { platform: "feishu", platformUserId: "ou_xxx" }
  app.post("/api/link", async (c) => {
    if (!hub) return c.json({ error: "ChannelHub not configured" }, 400)
    const { platform, platformUserId } = await c.req.json() as { platform: string; platformUserId: string }
    if (!platform || !platformUserId) return c.json({ error: "platform and platformUserId required" }, 400)

    const userId = await resolveWebUserId(c)
    await hub.router.linkPlatform(userId, platform, platformUserId)
    const bindings = await hub.router.listBindingsByUser(userId)
    return c.json({ ok: true, userId, bindings })
  })

  // 生成一次性绑定 token：用户在飞书发 "/bind <token>" 完成跨平台身份合并
  app.post("/api/link/token", async (c) => {
    if (!hub) return c.json({ error: "ChannelHub not configured" }, 400)
    const userId = await resolveWebUserId(c)
    const token = hub.router.createLinkToken(userId)
    return c.json({
      token,
      expiresIn: 300, // 5 分钟
      instruction: `在飞书上给 Arete 发消息：/bind ${token}`,
    })
  })

  // ===== P0.3 数据边界：导出与删除当前用户的数据 =====
  // 导出当前用户的 profile / memories / relationship / events，格式 JSON。
  // userId 始终来自 cookie，不接受查询参数，杜绝跨用户读取。
  app.get("/api/data/export", async (c) => {
    if (!memory || !eventStore) return c.json({ error: "Data export not configured" }, 503)
    const userId = await resolveWebUserId(c)
    const data = await exportUserData(memory, companion ?? ({} as CompanionEngine), eventStore, userId)
    return c.json(data)
  })

  // 删除当前用户的全部数据。删除后该用户的事件、记忆、关系、会话均不可查询。
  app.delete("/api/data", async (c) => {
    const userId = await resolveWebUserId(c)
    const result = await deleteUserData(userId)
    return c.json({ ok: true, ...result })
  })

  return app
}

export function createAreteWebServer(
  pipeline: AgentPipeline,
  mcp?: MCPManager,
  port = 3000,
  knowledge?: (query: string) => Promise<string>,
  hub?: ChannelHub,
  events?: EventBus,
  eventStore?: EventStore,
  workRunner?: AgentWorkRunner,
  providerHealth?: () => unknown,
  scheduler?: DurableScheduler,
  memory?: MemoryEngine,
  companion?: CompanionEngine,
  emotion?: EmotionEngine,
  journal?: JournalEngine,
) {
  const app = createAreteApp(
    pipeline,
    mcp,
    knowledge,
    hub,
    events,
    eventStore,
    workRunner,
    providerHealth,
    scheduler,
    memory,
    companion,
    emotion,
    journal,
  )
  console.log(`Arete web: http://localhost:${port}`)
  serve({ fetch: app.fetch, port: port })
}

function parseLimit(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(max, parsed))
}

function getHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Arete - Fitness Companion</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0f0f0f; color:#e0e0e0; height:100vh; display:flex; flex-direction:column; }
.header { padding:14px 20px; border-bottom:1px solid #2a2a2a; font-size:14px; color:#4ade80; font-weight:600; display:flex; align-items:center; gap:12px; flex-shrink:0; }
.header span { color:#666; font-weight:400; font-size:12px; }
.msgs { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:12px; }
.msg { max-width:80%; padding:12px 16px; border-radius:12px; font-size:14px; line-height:1.6; white-space:pre-wrap; }
.msg.user { background:#4ade80; color:#000; align-self:flex-end; border-bottom-right-radius:4px; }
.msg.assistant { background:#2a2a2a; color:#e0e0e0; align-self:flex-start; border-bottom-left-radius:4px; }
.msg.loading { background:transparent; color:#666; font-style:italic; align-self:flex-start; }
.input-area { padding:12px 20px; border-top:1px solid #2a2a2a; display:flex; gap:10px; flex-shrink:0; }
.input-area input { flex:1; padding:12px 16px; border-radius:10px; border:1px solid #333; background:#1a1a1a; color:#e0e0e0; font-size:14px; outline:none; }
.input-area input:focus { border-color:#4ade80; }
.input-area button { padding:12px 24px; border-radius:10px; border:none; background:#4ade80; color:#000; font-weight:600; cursor:pointer; font-size:14px; }
.input-area button:disabled { opacity:0.4; cursor:not-allowed; }
.link-btn { margin-left:auto; padding:6px 12px; font-size:12px; background:transparent; color:#4ade80; border:1px solid #4ade80; border-radius:6px; cursor:pointer; }
.link-btn:hover { background:#4ade80; color:#000; }
.modal-mask { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:100; }
.modal { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; padding:24px; max-width:380px; width:90%; }
.modal h3 { color:#4ade80; font-size:15px; margin-bottom:12px; }
.modal p { color:#999; font-size:13px; line-height:1.6; margin-bottom:14px; }
.token-box { background:#0f0f0f; border:1px dashed #4ade80; border-radius:8px; padding:14px; text-align:center; font-size:24px; letter-spacing:4px; color:#4ade80; font-weight:700; margin-bottom:14px; font-family:monospace; }
.modal .close { width:100%; padding:10px; border-radius:8px; border:none; background:#2a2a2a; color:#e0e0e0; cursor:pointer; font-size:13px; }
.modal .countdown { color:#666; font-size:11px; text-align:center; margin-bottom:10px; }
.trace-drawer { position:fixed; top:0; right:0; width:min(460px,100vw); height:100vh; background:#151515; border-left:1px solid #2a2a2a; z-index:80; padding:14px; overflow:auto; }
.trace-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; color:#4ade80; }
.trace-head button { padding:6px 10px; border:1px solid #333; background:#202020; color:#e0e0e0; border-radius:6px; cursor:pointer; }
.trace-summary { display:grid; gap:6px; margin-bottom:12px; font-size:12px; color:#aaa; }
.trace-list { display:flex; flex-direction:column; gap:8px; margin-bottom:14px; }
.trace-item { border:1px solid #2a2a2a; border-radius:8px; padding:8px; background:#101010; font-size:12px; color:#bbb; }
.trace-item strong { color:#e0e0e0; }
/* Safety / error visual markers — left border accent by severity.
   hard boundary or high-priority error -> red; soft boundary -> amber. */
.trace-item.safety-hard { border-left:3px solid #ef4444; background:#1a0d0d; }
.trace-item.safety-soft { border-left:3px solid #f59e0b; background:#1a1408; }
.trace-item.priority-high { border-left:3px solid #ef4444; }
.trace-payload { margin-top:6px; white-space:pre-wrap; color:#777; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; }
</style></head>
<body>
<div class="header">Arete <span>Fitness Companion</span><button class="link-btn" id="tracebtn" onclick="toggleTraces()">Traces</button><button class="link-btn" id="linkbtn" onclick="genToken()">绑定飞书</button></div>
<div class="msgs" id="msgs"><div class="msg assistant">Hi! I'm Arete, your fitness companion. Ask me anything about training, nutrition, or logging.</div></div>
<div class="input-area">
<input id="input" type="text" placeholder="Type a message..." spellcheck="false" autofocus>
<button id="sendbtn" onclick="send()">Send</button>
</div>
<aside class="trace-drawer" id="trace-drawer" hidden>
  <div class="trace-head">
    <strong>Runtime Traces</strong>
    <button onclick="loadTraces()">Refresh</button>
  </div>
  <div id="trace-summary" class="trace-summary"></div>
  <div id="trace-scheduler" class="trace-list"></div>
  <div id="trace-chat" class="trace-list"></div>
  <div id="trace-events" class="trace-list"></div>
</aside>
<script>
var input = document.getElementById('input');
var sendbtn = document.getElementById('sendbtn');
var msgs = document.getElementById('msgs');
var history = [];

input.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

function addMsg(text, role) {
  var d = document.createElement('div');
  d.className = 'msg ' + role;
  d.textContent = text;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function send() {
  var msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  sendbtn.disabled = true;
  addMsg(msg, 'user');

  var loading = addMsg('Thinking...', 'loading');
  var historyCopy = history.slice(-10);

  fetch('/api/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ message: msg, history: historyCopy })
  })
  .then(function(r) { if (!r.ok) throw new Error('Server error (' + r.status + ')'); return r.json(); })
  .then(function(d) {
    loading.remove();
    addMsg(d.reply || '*no response*', 'assistant');
    history.push({ role: 'user', content: msg });
    history.push({ role: 'assistant', content: d.reply });
    if (history.length > 20) history = history.slice(-20);
  })
  .catch(function(e) {
    loading.remove();
    addMsg('Error: ' + e.message, 'assistant');
  })
  .finally(function() { sendbtn.disabled = false; input.focus(); });
}

var countdownTimer = null;
function genToken() {
  fetch('/api/link/token', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error) { alert(d.error); return; }
      showBindModal(d.token, d.expiresIn);
    })
    .catch(function(e) { alert('生成 token 失败: ' + e.message); });
}

function showBindModal(token, expiresIn) {
  if (countdownTimer) clearInterval(countdownTimer);
  var mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = '<div class="modal">' +
    '<h3>绑定飞书</h3>' +
    '<p>1. 打开飞书，找到 Arete bot<br>2. 发送以下消息（5 分钟内有效）：</p>' +
    '<div class="token-box" id="tokenbox">/bind ' + token + '</div>' +
    '<div class="countdown" id="countdown"></div>' +
    '<button class="close" onclick="closeModal()">关闭</button>' +
    '</div>';
  document.body.appendChild(mask);

  var remain = expiresIn;
  var cd = document.getElementById('countdown');
  cd.textContent = remain + ' 秒后过期';
  countdownTimer = setInterval(function() {
    remain--;
    if (remain <= 0) {
      clearInterval(countdownTimer);
      cd.textContent = '已过期，请重新生成';
      document.getElementById('tokenbox').style.opacity = '0.4';
    } else {
      cd.textContent = remain + ' 秒后过期';
    }
  }, 1000);
}

function closeModal() {
  if (countdownTimer) clearInterval(countdownTimer);
  var mask = document.querySelector('.modal-mask');
  if (mask) mask.remove();
}

function toggleTraces() {
  var drawer = document.getElementById('trace-drawer');
  drawer.hidden = !drawer.hidden;
  if (!drawer.hidden) loadTraces();
}

function loadTraces(correlationId) {
  Promise.all([
    fetch('/api/traces').then(function(r) { return r.json(); }),
    fetch('/api/events?limit=50' + (correlationId ? '&correlationId=' + encodeURIComponent(correlationId) : '')).then(function(r) { return r.json(); }),
    fetch('/api/scheduler-stats').then(function(r) { return r.json(); }).catch(function() { return { enabled: false }; })
  ]).then(function(results) {
    renderTraceSummary(results[0]);
    renderSchedulerStats(results[2]);
    renderChatTraces(results[0].recent || []);
    renderEvents(results[1].events || []);
  }).catch(function(e) {
    document.getElementById('trace-summary').textContent = 'Trace load failed: ' + e.message;
  });
}

function renderTraceSummary(data) {
  var el = document.getElementById('trace-summary');
  el.replaceChildren();
  var events = data.events;
  if (!events) {
    el.textContent = 'No event metrics yet.';
    return;
  }
  var total = document.createElement('div');
  total.textContent = 'Total events: ' + events.total;
  el.appendChild(total);
  var types = Object.keys(events.byType || {});
  for (var i = 0; i < types.length; i++) {
    var type = types[i];
    var v = events.byType[type];
    var row = document.createElement('div');
    row.textContent = type + ': ' + v.count + ' avg ' + v.avgMs + 'ms';
    el.appendChild(row);
  }
}

function renderSchedulerStats(data) {
  var el = document.getElementById('trace-scheduler');
  el.replaceChildren();
  if (!data || !data.enabled) return;
  var head = document.createElement('strong');
  head.textContent = 'Scheduler';
  el.appendChild(head);
  var counts = document.createElement('div');
  counts.textContent = 'queued ' + (data.queued || 0) + ' · running ' + (data.running || 0) + ' · completed ' + (data.completed || 0) + ' · failed ' + (data.failed || 0);
  el.appendChild(counts);
  var failures = data.recentFailures || [];
  for (var i = 0; i < failures.length; i++) {
    var f = failures[i];
    var box = document.createElement('div');
    box.className = 'trace-item';
    box.style.borderLeft = '3px solid #ef4444';
    var t = document.createElement('strong');
    t.textContent = f.type + ' (' + f.attempts + 'x)';
    box.appendChild(t);
    box.appendChild(document.createElement('br'));
    var u = document.createElement('span');
    u.textContent = 'user ' + f.userId;
    box.appendChild(u);
    box.appendChild(document.createElement('br'));
    var err = document.createElement('span');
    err.textContent = f.lastError == null ? '' : f.lastError;
    box.appendChild(err);
    el.appendChild(box);
  }
}

function renderChatTraces(items) {
  var el = document.getElementById('trace-chat');
  el.replaceChildren();
  var head = document.createElement('strong');
  head.textContent = 'Chat';
  el.appendChild(head);
  var recent = items.slice(-10);
  for (var i = 0; i < recent.length; i++) {
    var item = recent[i];
    var box = document.createElement('div');
    box.className = 'trace-item';
    var intentEl = document.createElement('strong');
    intentEl.textContent = item.intent;
    box.appendChild(intentEl);
    box.appendChild(document.createTextNode(' ' + item.ms + 'ms / ' + item.tokens + ' tokens'));
    box.appendChild(document.createElement('br'));
    var startEl = document.createElement('span');
    startEl.textContent = item.start;
    box.appendChild(startEl);
    el.appendChild(box);
  }
}

function renderEvents(items) {
  var el = document.getElementById('trace-events');
  el.replaceChildren();
  var head = document.createElement('strong');
  head.textContent = 'Events';
  el.appendChild(head);
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var box = document.createElement('div');
    // Safety events and high-priority errors get a visible severity marker so
    // they can be spotted at a glance and filtered by correlationId.
    var isSafety = item.type === 'SafetyBoundaryTriggered';
    var safetyLevel = isSafety && item.payload ? item.payload.level : null;
    var isChannelFail = item.type === 'ChannelSendFailed';
    var cls = 'trace-item';
    if (safetyLevel === 'hard') cls += ' safety-hard';
    else if (safetyLevel === 'soft') cls += ' safety-soft';
    else if (isChannelFail) cls += ' safety-hard';
    else if (item.priority === 'high' || (item.metadata && item.metadata.priority === 'high')) cls += ' priority-high';
    box.className = cls;
    var typeEl = document.createElement('strong');
    typeEl.textContent = item.type;
    box.appendChild(typeEl);
    if (isSafety) {
      var tag = document.createElement('span');
      tag.textContent = ' [' + safetyLevel + ' boundary]';
      tag.style.color = safetyLevel === 'hard' ? '#ef4444' : '#f59e0b';
      box.appendChild(tag);
    } else if (isChannelFail) {
      var failTag = document.createElement('span');
      failTag.textContent = ' [channel send failed]';
      failTag.style.color = '#ef4444';
      box.appendChild(failTag);
    } else if (item.type === 'ChannelMessageSent') {
      var sentTag = document.createElement('span');
      sentTag.textContent = ' [delivered]';
      sentTag.style.color = '#10b981';
      box.appendChild(sentTag);
    }
    box.appendChild(document.createTextNode(' ' + (item.source == null ? '' : item.source)));
    box.appendChild(document.createElement('br'));
    var tsEl = document.createElement('span');
    tsEl.textContent = item.timestamp;
    box.appendChild(tsEl);
    box.appendChild(document.createElement('br'));
    var btn = document.createElement('button');
    btn.textContent = item.correlationId == null ? '' : item.correlationId;
    (function(cid) {
      btn.addEventListener('click', function() { loadTraces(cid); });
    })(item.correlationId);
    box.appendChild(btn);
    var payloadEl = document.createElement('pre');
    payloadEl.className = 'trace-payload';
    payloadEl.textContent = JSON.stringify(item.payload, null, 2);
    box.appendChild(payloadEl);
    el.appendChild(box);
  }
}
</script>
</body></html>`
}
