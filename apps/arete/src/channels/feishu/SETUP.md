# 让 Arete 在飞书里陪你聊

配好这个，Arete 会主动在飞书找你："今天练不练？"、"午餐打算吃什么？"。你回复后它接着聊，跨天还记得你说过的话。

## 你要做什么（约 15 分钟）

### 第 1 步：创建飞书应用（5 分钟）

1. 打开 https://open.feishu.cn/app
2. 点"创建企业自建应用"
3. 填应用名（比如 "Arete"）、描述、图标，点创建
4. 进入应用 → "凭证与基础信息"，记下：
   - **App ID**（`cli_xxx` 开头）
   - **App Secret**

### 第 2 步：配置事件订阅（3 分钟）

1. 应用左侧菜单 → "事件订阅"
2. "加密策略"选"encrypt key 模式"，记下 **Encrypt Key**
3. "验证策略"记下 **Verification Token**
4. 请求地址填写：`https://<你的公网域名>/webhook/feishu`（下一步用 ngrok 拿域名）
5. 添加事件：搜索并勾选 `im.message.receive_v1`（接收消息）

### 第 3 步：配置权限（2 分钟）

应用左侧 → "权限管理"，开通：
- `im:message`（发消息）
- `im:message.receive_v1`（接收消息）

### 第 4 步：启动内网穿透（1 分钟）

飞书要公网 URL 才能回调。本地开发用 ngrok / cloudflared 一条命令：

```bash
# 方案 A：ngrok
ngrok http 3001

# 方案 B：cloudflared（免费，不用注册）
cloudflared tunnel --url http://localhost:3001
```

复制输出里的公网 URL（像 `https://abc123.ngrok.io`），回到第 2 步填到请求地址：
```
https://abc123.ngrok.io/webhook/feishu
```

点"验证"——飞书会发 challenge，Arete 已实现自动应答。验证通过就 OK。

### 第 5 步：填 .env（1 分钟）

在项目根目录 `.env` 加：

```bash
# 飞书应用凭证（第 1-2 步拿到的）
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_ENCRYPT_KEY=xxx
FEISHU_VERIFICATION_TOKEN=xxx
FEISHU_WEBHOOK_PORT=3001

# LLM（已有）
DEEPSEEK_API_KEY=sk-xxx
```

### 第 6 步：发布应用 + 加好友

1. 飞书后台 → "版本管理与发布" → 创建版本 → 发布
2. 在飞书客户端搜索你的应用名，加为好友
3. 给它发一条："你好"

## 会发生什么

```
[你给 Arete 发消息] → 飞书回调 → Arete 收到 → 查记忆 → 调 LLM → 回复你

[饭点 / 训练间隔触发] → Arete 主动发消息 → 你的飞书收到通知
```

Arete 会：
- 早 8-9 点问"早餐吃了什么？"
- 午 11-12 点问"午餐安排了吗？"
- 晚 17-18 点问"晚餐打算吃什么？"
- 3 天没训练问"今天搞一下？"
- 连续训练 3/5/7/14/21/30 天祝贺
- 跨会话记得你说过"膝盖不舒服"，下次主动问

## 验证 checklist

启动 Arete（`pnpm dev`）后，看日志：

- [x] `[Feishu] webhook listening on :3001/webhook/feishu`
- [x] `[Channels] Active: feishu`
- [x] `[Presence] Active on 1 channel(s)`
- [x] 飞书后台点"验证"通过
- [x] 飞书里给 Arete 发"你好"，收到回复
- [x] 等到饭点（或临时改 conditions.ts 的时间窗口），收到主动问候

## 常见问题

**Q: 飞书验证不通过？**
A: 确认 ngrok 在跑，URL 是 `/webhook/feishu` 结尾，端口是 3001。

**Q: 发消息没回复？**
A: 检查权限是否开通 `im:message`，应用是否已发布，是否加为好友。

**Q: 主动消息没收到？**
A: 你需要先给 Arete 发过至少一条消息（建立 binding），presence 才知道往哪发。

**Q: 本地关机后就不工作了？**
A: 对，ngrok 关了飞书回调就到不了。长期用要部署到云服务器（留 3001 端口开放）。
