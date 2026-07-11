# Release Checklist

## 自动验证基线

- [x] `pnpm build`（`corepack pnpm -r build` 通过）
- [x] `pnpm test`（channels 26 / runtime boundary+scheduler / arete e2e+privacy 全绿）
- [x] `pnpm lint`（`corepack pnpm -r lint` 通过）
- [x] `pnpm --filter @viraha/arete eval:smoke`（2 case 全过）
- [x] `pnpm --filter @viraha/arete eval:crisis`（5 中英文危机场景全过）

## P0 验收项（代码 + 自动测试）

### P0.1 真实渠道上线与回执

- [x] 新用户首次给 Bot 发消息后，获得稳定内部 `userId` 和 channel binding（ChannelRouter.resolveUserId，自动测试覆盖）
- [x] 同一用户连续发送两条消息时，第二条不会在第一条回复前越过执行（AgentWorkRunner `laneKey = channel:userId` 串行队列，e2e "queues web chat turns" 覆盖）
- [x] Bot 能发送回复，并在事件库中写入 `AgentResponseSent` 或等价出站事件（pipeline 内部发射 AgentResponseSent；ChannelHub.reply 经 eventSink 写 ChannelMessageSent/ChannelSendFailed）
- [x] 临时渠道 API 失败时，错误会进入 Trace；进程不会崩溃（hub.reply try-catch 隔离 + eventSink 写 ChannelSendFailed 高优先级事件；channels "outbound receipt" 测试覆盖）
- [x] 入站签名校验（飞书 verifyFeishuSignature：配置 encryptKey 时缺失签名头即拒绝，非静默放行；5 个签名测试覆盖）
- [ ] **人工验收**：在真实飞书或 QQ 环境手工完成"发消息 → 收回复 → Web 查看同一条 trace"的演示

### P0.2 持久化主动服务

- [x] 任务写入 SQLite 后关闭进程，再启动后仍可被领取（DurableScheduler lease-based 领取，scheduler 测试覆盖）
- [x] worker 在 lease 超时后回收 `running` 任务，同一时刻不会被两个 worker 同时执行（scheduler 测试覆盖）
- [x] 发送失败遵守指数退避和最大重试次数；超过上限进入可查询失败状态（scheduler 测试覆盖）
- [x] 同一用户在一个冷却窗口内不会收到两条相同类型的主动消息（presence-scheduler cooldownMs，scheduler 测试覆盖）
- [x] Trace Cockpit 显示 queued/running/failed/completed 数量及最近失败原因（web.ts scheduler stats 渲染）

### P0.3 隐私、身份与数据边界

- [x] 不同 Web 用户的 profile、memory、relationship 和 trace 无法通过 API 互相查询（cookie 派生 userId，privacy 测试覆盖）
- [x] 用户可导出自己的记忆、关系摘要和事件记录为 JSON（`GET /api/data/export`，privacy 测试覆盖）
- [x] 用户可删除自己的数据；删除后重新查询不返回旧记录（`DELETE /api/data` 跨 17 表级联，privacy 测试覆盖）
- [x] 日志和 Trace 不打印 Provider API Key、Cookie 或渠道签名（EventStore.persist 入库前 redactPayload，privacy "sanitization" 测试覆盖）
- [x] README 明确说明本地 SQLite、外部模型 Provider 和数据发送边界（README "Privacy & Data Boundaries" 小节）

### P0.4 安全边界（健身陪伴适配）

- [x] 自伤、伤人、处方/诊断请求触发硬边界，不返回可执行的危险步骤（BoundaryScanner BOUNDARY_RULES，boundary 测试覆盖）
- [x] 回复包含关怀和寻求当地专业/紧急帮助的引导，不使用冷冰冰的拒绝模板（CRISIS_REDIRECT 含北京心理危机热线 010-82951332，boundary 测试覆盖）
- [x] 每次触发在 EventStore 写入高优先级安全事件，并可在 Trace Cockpit 过滤（SafetyBoundaryTriggered 事件，web.ts safety-hard/safety-soft 高亮）
- [x] 中英文危机场景 Eval 全部通过；任何一项失败都阻止发布（`eval:crisis` 5 场景全过）
- [x] 规则词表和响应策略可审阅，不依赖不可解释的黑盒分类器（BOUNDARY_RULES 为公开 RegExp 数组，非 ML 分类器）

## Gate 0：统一产品定位（纯人工决策）

- [ ] **人工验收**：维护者确认 Arete 保持健身陪伴定位，README / vision-and-roadmap / identity.ts 三处一致
- [ ] **人工验收**：只保留与健身定位匹配的默认技能、知识包、欢迎语和 Eval 数据集
- [ ] **人工验收**：新用户能在首屏或 README 中明确知道 Arete 能做什么、不能做什么

## 通用发布检查

- [ ] Manual chat works
- [ ] Trace drawer shows recent events
- [ ] Tool permission denial appears in trace
- [ ] Web and channel messages serialize for same user
- [ ] `.env.example` documents required variables
