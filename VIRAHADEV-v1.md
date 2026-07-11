# Viraha Development Strategy v1

> 这不是愿景文档，不是架构宣言，不是哲学文章。  
> 这是 Viraha 项目未来一年真正可执行的 CTO 开发计划。  
> 每一行都来自痛点和 Arete 的真实需求。

---

## 一、Viraha 到底是什么

> Viraha 解决的问题：

**English** (19 words): *Lets developers deploy relationship-aware AI companions into social platforms without building LLM orchestration, memory, or channel infrastructure.*

**中文**: 让开发者在已有社交平台里部署会主动聊天、记得用户、关系随使用时间成长的 AI 伴侣，而无需从零搭建 LLM 调度和记忆系统。

### 不是什么

- ❌ 不是 Agent OS
- ❌ 不是通用 Agent Framework
- ❌ 不是 LangChain 替代品
- ❌ 不是 ChatGPT 平替
- ❌ 不是 Character.AI 开源版

### 是什么

Viraha 填补的是**从"LLM 能聊天"到"IM 里有伴侣"**之间的所有基础设施缺失：

| 缺失层 | Viraha 提供 |
|--------|-----------|
| 哪个模型？怎么调？熔断了怎么办？ | 多 Provider 抽象层 |
| 上次聊了啥？用户什么偏好？ | 分层记忆库 |
| 聊多了关系会变吗？ | 关系状态机 |
| 伴侣能主动说话吗？ | Presence 调度 |
| 怎么接到飞书/QQ？ | Channel 适配器 |
| 伴侣知道自己的领域知识吗？ | 知识包 RAG |

---

## 二、工程原则

### 原则一：Arete First

所有 Runtime 抽象必须首先在 Arete 中得到验证。未被官方 Companion 使用的通用代码直接删除。

执行方式：
- 写任何 packages/ 代码前，先在 apps/arete/ 里验证
- 在 packages/ 中存在的每个模块，必须有 Arete 的 import 路径可查
- 没有 Arete 用量的模块 → Delete

### 原则二：Pain Driven

任何新模块必须来自真实的用户痛点，且该痛点被至少两个独立用户确认。

禁止：
- "以后可能会用到"而写的抽象
- "架构应该这样才美"而写的接口
- "别人都有所以我们也要有"的功能

### 原则三：Suffer Before Abstract (SBA)

在同一个痛点出现三次之前，不允许引入抽象层。

```
第一次：硬编码解决问题
第二次：复制代码，注意到重复
第三次：抽取出通用模块
```

### 原则四：Minimal Runnable

任何模块在写第二行代码之前，必须先跑通一个端到端的例子。

```
先验证可行性，再写实现。
先跑通 Arete 健身场景，再抽象成通用接口。
```

### 原则五：Testing Gate

没有自动化测试的代码，等于没写完。

```
Stage 0 要求: 核心链路必须有测试
Stage 1 要求: 所有 Arete 使用的模块有基础测试
Stage 2 要求: 所有 packages/ 有回归测试
Stage 4 要求: 对外 API 有完整测试覆盖
```

### 原则六：Composition Over Inheritance

Companion 由可组合的模块构成，不继承抽象基类。

```
✅ arete = identity + memory + skills + knowledge + presence
❌ class Arete extends GenericCompanion
```

### 原则七：Convention Over Configuration

新的 Companion 应能用一套文件+最少配置跑起来。

```
✅ viraha create sophia → 生成 sophia 目录 + 默认配置
❌ 需要填充 20 个接口实现才能跑的第一个 TODO 应用
```

### 原则八：Delete First

每季度做一次代码审查，删除不被使用的代码。

``` 
删除比写代码更重要。
未被使用的代码不是资产，是负债。
```

---

## 三、开发路线图（按产品成熟度）

### Stage 0：让 Arete 能正常工作

**目标**: Arete 可以作为一个健身伴侣在 Web 端正常工作——用户能聊天、记录训练、查看进度。

**成功标准**: 
- `pnpm web` 启动后，用户可以在浏览器里和 Arete 对话
- 用户能记录训练和饮食
- Arete 能记住用户信息跨会话
- 所有 stages 和 tools 不报错

**绝对不能做的事**:
- ❌ 设计通用接口
- ❌ 写任何未来的代码
- ❌ 关注性能优化
- ❌ 为"第二伴侣"做准备

**必须完成的事**:
- 修复目前 Arete 的启动链路（确保 `pnpm web` 无报错）
- 验证核心对话链路：用户发消息 → LLM 调用 → 返回回复 → 存储消息
- 验证记忆链路：用户说"我膝盖不舒服" → 下次对话 Arete 记得
- 验证技能链路：用户说"帮我做今天的训练" → 技能触发 → 记录训练
- 删除所有未使用的 packages/ 中的模块（见第四章）
- 跑通当前测试，修复失败的测试

**进入下一阶段条件**: Arete 在 Web 端能完成一个完整的对话+训练记录+记忆闭环。

---

### Stage 1：让 Arete 比 ChatGPT 更适合健身

**目标**: 一个健身爱好者选择 Arete 而不是 ChatGPT 的理由——因为它知道训练知识、能主动提醒、能跟踪进度。

**成功标准**:
- 新用户注册后 5 分钟内完成第一次训练记录
- Arete 能回答常见的健身问题（参考 knowledge-packs/fitness-pack）
- Arete 能基于用户训练历史给出建议
- 关系引擎记录每次互动的变化

**绝对不能做的事**:
- ❌ 增加新的领域方向（学习伴侣、写作伴侣等）
- ❌ 抽象通用 Presence 引擎
- ❌ 设计 Companion 注册市场
- ❌ 增加多渠道

**必须完成的事**:
- 补全 fitness-pack 知识包（训练/营养/恢复/心理四个领域）
- 将 fitness-pack 接入 ContextBuilder（目前可能未被连接）
- 验证关系引擎在 Arete 中的真实工作：记录互动→加 XP→升级→改变语气
- 修复 KnowledgeEngine 语义搜索（目前 keyword fallback）
- 为核心链路添加测试

**进入下一阶段条件**: 作者本人（或一个真实用户）连续使用 Arete 一周，认为它比 ChatGPT 更适合健身场景。

---

### Stage 2：连续使用 30 天

**目标**: 一个真实用户连续 30 天每天和 Arete 交互，证明它能支撑长期使用。

**成功标准**:
- 用户连续 30 天有交互记录
- 没有数据丢失或状态不一致
- 关系引擎正确反映 30 天的互动积累
- 30 天后对话质量没有下降（记忆管理正常工作）
- Presence 在合适的时机发送消息

**绝对不能做的事**:
- ❌ 优化代码性能（除非用户真的遇到慢的问题）
- ❌ 添加新功能
- ❌ 重构架构

**必须完成的事**:
- 确保 30 天积累的几千条消息不会撑爆上下文窗口（SessionCompressor 验证）
- 确保 ReflectionEngine 不阻塞正常响应
- 确保 Presence 不会过度发送消息骚扰用户
- 记录 Bug 和体验问题作为 Pain Log

**进入下一阶段条件**: 完成 30 天连续使用，收集到足够的 Pain Log。

---

### Stage 3：完成 100 条真实 Pain Log

**目标**: 通过真实使用暴露问题，积累足够的数据来指导后续开发。

**成功标准**:
- 100 条 Pain Log 写入到项目中
- 每个 Pain Log 包含：场景、期望、实际行为、严重度
- 对 Pain Log 进行归类和分析
- 前 5 个最常见的 Pain 类型确定

**绝对不能做的事**:
- ❌ 基于猜测增加功能
- ❌ 架构重构

**必须完成的事**:
- 建立 Pain Log 模板和存放位置
- 每次使用后记录痛点
- 每周分析 Pain Log，更新优先级

**进入下一阶段条件**: 100 条真实 Pain Log 完成分类分析，TOP3 痛点明确。

---

### Stage 4：抽象出 Runtime

**目标**: 基于前三个阶段暴露的真正痛点，将 Arete 中验证过的能力抽取出可复用的 Runtime。

**注意**: 此时才允许谈论 Runtime。所有抽象必须来自 Stage 0-3 的真实需求。

**成功标准**:
- Runtime 中的每个模块都至少在 Arete 中运行了 30 天
- 每个抽象层都能说出它解决了 Stage 3 中的哪个 Pain
- 没有单个 Pain 驱动的抽象
- Runtime 完整独立于 Arete（Arete 作为上层使用 Runtime）

**绝对不能做的事**:
- ❌ 为未来伴侣预留扩展点
- ❌ 设计插件市场
- ❌ 写开发者文档（此时还没有外部用户）

**必须完成的事**:
- 确定 Runtime 的边界：哪些留在 packages/，哪些属于 apps/arete/
- 将 Arete 中的核心逻辑抽取出接口
- 删除所有未被 Arete 使用的 packages/ 代码
- 确保 Runtime 有测试覆盖

**进入下一阶段条件**: Runtime 独立存在，Arete 作为一个上层应用使用 Runtime，所有模块都有实际的使用证据。

---

### Stage 5：制作第二个 Companion

**目标**: 用 Stage 4 抽象出的 Runtime 构建第二个 Companion，验证 Runtime 是否独立可用。

**注意**: 这时才允许考虑"第二个伴侣"。方向根据 Arete 的 Pain Log 决定——可能是学习伴侣、写作伴侣或情绪陪伴。

**成功标准**:
- 第二个 Companion 可以正常对话
- 第二个 Companion 有独立的 identity 和 domain knowledge
- 第二个 Companion 复用了 Runtime 的：memory、relationship、provider、presence
- 开发第二个 Companion 的时间不超过 Arete 的 20%（验证 Runtime 确实减少了重复工作）

**绝对不能做的事**:
- ❌ 为第二个 Companion 专门修改 Runtime（应该自然兼容）
- ❌ 发布到公开市场

**必须完成的事**:
- 选择 Companion 方向（基于 Pain Log 或用户兴趣）
- 定义 Identity、Knowledge、Skills
- 配置 Channel 适配器
- 验证 Runtime 不需要为它修改

**进入下一阶段条件**: 第二个 Companion 成功运行，且开发工作量证明 Runtime 有效。

---

### Stage 6：验证 Runtime 是否成立

**目标**: 严格审查 Runtime 设计，找出过度设计和遗漏的地方。

**成功标准**:
- Runtime 中每个模块都可以回答：这个抽象解决了什么真实问题
- 没有"我觉得以后会用到"的接口
- 两个 Companion 都能正常升级到新版 Runtime
- 将 Pain Log 中未解决的问题与新 Runtime 对照

**绝对不能做的事**:
- ❌ 继续增加新功能
- ❌ 优化性能
- ❌ 设计未来扩展

**必须完成的事**:
- 对比两个 Companion 的使用情况，找出 Runtime 中不必要的抽象
- 简化 Runtime
- 确认 Runtime 没有偷懒把 apps/ 逻辑误放进 packages/
- 文档化两个 Companion 的开发经验

**进入下一阶段条件**: Runtime 通过双 Companion 验证，所有模块被证明必要。

---

### Stage 7：开源

**目标**: 将 Viraha + Arete + Runtime 以高质量开源项目发布。

**成功标准**:
- 完整的 README（30 秒理解设计）
- 清晰的目录结构
- 可运行的 Quick Start
- 基本的贡献指南
- 开源协议（MIT）

**绝对不能做的事**:
- ❌ 大张旗鼓的宣传前验证所有文档准确性
- ❌ 发布时承诺过多功能

**必须完成的事**:
- 重新设计 README（见第六章）
- 完善 CONTRIBUTING.md
- 确保 `pnpm build && pnpm test` 在 Clean 环境中通过
- 配置 CI
- 准备 Issue Template

**进入下一阶段条件**: 项目以"可用"而非"预览"状态发布。

---

### Stage 8：社区贡献

**目标**: 外部开发者可以理解、使用、贡献代码。

**成功标准**:
- 至少 3 个外部 PR 被合并（不包含 typo 修复）
- 至少 1 个外部开发者成功运行 Arete
- 没有"文档写了但跑不通"的路径

**绝对不能做的事**:
- ❌ 接受破坏现有设计的大 PR
- ❌ 过早接受新 Companion 贡献

**必须完成的事**:
- 响应 Issue 和 PR
- 更新文档
- 建立贡献者行为准则
- 保持 Stage 6 的设计纪律

---

## 四、Runtime 模块审计

### 当前 packages/ 状态

| 包 | 是否被 Arete 使用 | 实际代码 | 建议 |
|----|-----------------|---------|------|
| core | ✅ 是 | ✅ | Keep — 类型定义 |
| db | ✅ 是 | ✅ | Keep — 数据持久化 |
| provider | ✅ 是 | ✅ | Keep — LLM 调用抽象 |
| runtime | ✅ 是 | ✅ | Keep — 核心编排 |
| memory | ✅ 是 | ✅ | Refactor — 缺 Hebbian/向量搜索/fade |
| context | ✅ 是 | ✅ | Keep — Token 预算管理 |
| skills | ✅ 是 | ✅ | Keep — 技能注册/执行 |
| mcp | ✅ 是 | ✅ | Keep — MCP 客户端 |
| identity | ✅ 是 | ✅ | Refactor — 合并到 runtime 或 core |
| intent | ✅ 是 | ✅ | Refactor — 合并到 runtime |
| planner | ✅ 是 | ✅ | Refactor — 合并到 runtime |
| reasoning | ✅ 是 | ✅ | Refactor — 合并到 runtime |
| execution | ✅ 是 | ✅ | Refactor — 合并到 runtime |
| reflection | ✅ 是 | ✅ | Refactor — 异步化，合并到 runtime |
| relationship | ⚠️ 存在但未确认活跃使用 | ✅ | Keep — 核心差异化 |
| persona | ⚠️ 存在但未确认活跃使用 | ✅ | Keep — 人格引擎 |
| knowledge | ❌ 未被 Arete 使用 | ✅ | Delete → 移到 apps/arete/ |
| presence | ❌ 未被 Arete 使用 | ✅ | Delete → 移到 apps/arete/ |
| growth | ❌ 未被 Arete 使用 | ✅ | Delete → 移到 apps/arete/ |
| workflow | ❌ 未被 Arete 使用 | ✅ | Delete → 移到 apps/arete/ |
| channels | ❌ 未被 Arete 使用 | ⚠️ 仅有接口 | Delete → 接口放入 core |
| scheduler | ❌ 未被 Arete 使用 | ❌ 空文件 | Delete |
| sdk | ⚠️ 被 apps 使用 | ✅ | Keep — 但需简化 |

### 严格审计结果

#### Keep（保留在 packages/）

| 包 | 理由 |
|----|------|
| core | 所有模块依赖的类型和端口接口 |
| db | 数据持久化，所有模块依赖 |
| provider | LLM 调用抽象，Arete 核心依赖 |
| runtime | 核心编排逻辑，Pipeline + EventBus + Session + Queue |
| memory | 分层记忆系统，Arete 核心依赖 |
| context | Token 预算管理，上下文组装 |
| skills | 技能注册和执行 |
| mcp | MCP 客户端集成 |
| relationship | 核心差异化——关系状态机 |
| persona | 人格引擎 |

#### Refactor（需要重构）

| 包 | 问题 | 方向 |
|----|------|------|
| identity | 仅一个数据对象，不应独占一个包 | 合并到 runtime 或 core |
| intent | 仅一个分析步骤，不应独占一个包 | 合并到 runtime |
| planner | 仅一个计划生成步骤 | 合并到 runtime |
| reasoning | 仅一个 Think-Observe-Act 循环 | 合并到 runtime |
| execution | StateStore 逻辑简单 | 合并到 runtime |
| reflection | 阻塞在响应路径上 | 异步化，合并到 runtime |
| memory | 缺联想记忆、语义搜索、记忆生命周期 | 补全三个能力 |
| sdk | 公共 API 包装 | 简化接口 |

#### Delete（从 packages/ 移除）

| 包 | 处理方式 |
|----|---------|
| knowledge | 目录移到 apps/arete/，作为 Arete 内部模块 |
| presence | 目录移到 apps/arete/，目前只有 Arete 需要主动调度 |
| growth | 目录移到 apps/arete/，目前只有 Arete 需要成就系统 |
| workflow | 目录移到 apps/arete/，目前只有 Arete 需要目标管理 |
| channels | 接口定义移入 core/types.ts，删除 packages/channels/ |
| scheduler | 直接删除，无实现 |

#### Future（以后考虑）

无。未经 Arete 验证的模块不得保留为 Future。

### 重构后 packages/ 结构

```
packages/
├── core/          类型、端口接口、少量工具函数
├── db/            SQLite 持久化
├── provider/      LLM 调用抽象 (Anthropic + DeepSeek)
├── runtime/       核心编排 (Pipeline + EventBus + Session + Queue + Identity + Intent + Planner + Reasoning + Execution + Reflection)
├── memory/        分层记忆 + Hebbian + 语义搜索 + Fade
├── context/       Token 预算 + 上下文组装
├── skills/        技能注册 + 技能执行
├── mcp/           MCP 客户端
├── relationship/  关系状态机
└── persona/       人格引擎
```

**11 个包，从当前 23 个缩减。**

---

## 五、Companion MVP

### Companion 的最小定义

Companion 不是 Prompt，不是 Persona。Companion 由以下 6 个能力组成（MVP）：

```
Companion = Identity + Knowledge + Capabilities + Relationship + Presence + Persona
```

### 模块详解

#### 1. Identity

Companion 回答"我是谁"的能力。

MVP 字段:
```
name: string           // 名字
description: string    // 一句话描述
type: "coach" | "companion" | "assistant"
personaId: string      // 人格模板
```

禁止:
- ❌ AgentId / Version / Capabilities 列表 / Boundaries / CoreValues

#### 2. Knowledge

Companion 回答"我知道什么"的能力。

MVP: 加载 Markdown 文件作为领域知识库，支持基础关键词搜索。

禁止:
- ❌ 向量数据库
- ❌ 多个知识路由策略
- ❌ 知识包版本管理

#### 3. Capabilities (Skills)

Companion 回答"我能做什么"的能力。

MVP: 注册一组函数，LLM 可以根据对话上下文调用。

禁止:
- ❌ SkillManifest / SkillDependency / SkillVersion
- ❌ 技能市场 / 技能发现 / 技能评分

#### 4. Relationship

Companion 回答"我和你什么关系"的能力。

MVP:
```
score: number          // 亲密度 0-100
trust: number          // 信任度 0-100
level: number          // 等级
xp: number             // 经验值
lastInteraction: Date  // 上次互动时间
```

禁止:
- ❌ Attachment / Intimacy / Initiative / DecayRate
- ❌ 多维度情感向量

#### 5. Presence

Companion 回答"我什么时候找你"的能力。

MVP: 基于简单时间规则的主动消息（"如果超过 N 小时没聊天，发一条消息"）。

禁止:
- ❌ 条件引擎 / 触发链 / 情绪权重
- ❌ 用户状态感知

#### 6. Persona

Companion 回答"我以什么风格说话"的能力。

MVP: 一组系统提示词模板，定义语气、用词习惯、互动风格。

禁止:
- ❌ 多维人格矩阵
- ❌ Persona 蒸馏

### 未来才允许添加的

- **Memory Ranking**（记忆排序） → 有 100+ 用户时
- **Multi-turn Planner**（多轮规划） → 用户反馈"Arete 不会主动安排一周训练"
- **Emotion Model**（情绪模型） → 两个 Companion 都上线后
- **Plugin System**（插件系统） → 三个 Community PR 请求时

---

## 六、README 大纲

### 页面结构

```
# Viraha — 你社交平台里的 AI 伴侣

📐 30 秒理解
   ├── Viraha 是什么（一句话）
   ├── Arete 是什么（官方健身伴侣）
   └── 为什么值得试（和 ChatGPT/Character.AI 的区别）

📦 快速开始
   ├── 前置条件
   ├── 一分钟启动
   └── 修改 Companion

🏗️ 构建自己的 Companion
   ├── 定义 Identity
   ├── 添加 Knowledge
   ├── 配置 Presence
   └── 部署到渠道

🧩 架构
   ├── Framework vs Companion
   ├── 核心模块概览
   └── 数据流图

🛣️ 路线图
   ├── 当前阶段
   └── 未来规划

🤝 贡献
   ├── 开发指南
   ├── 行为准则
   └── License (MIT)
```

### 第一屏必须包含

```
Viraha — 你社交平台里的 AI 伴侣

Viraha 让开发者在飞书/QQ/微信里部署会主动聊天、
记得用户、关系随时间成长的 AI 伴侣。

Arete 是官方健身伴侣——在浏览器或 IM 里陪伴你训练、饮食、进步。

pnpm create viraha && pnpm dev
→ 3 分钟拥有自己的 AI 伴侣
```

---

## 七、目录结构调整

### 当前结构的问题

1. `packages/` 和 `apps/` 平级导致职责混乱——渠道适配器放在 apps/ 里不清晰
2. 包拆分过度（23 个包，大部分功能单一文件）
3. 官方伴侣（Arete）和空壳（discord-bot 等）混在一起
4. knowledge/presence/growth/workflow 放在 packages/ 但未被 Arete 使用

### 目标结构

```
viraha/
├── packages/
│   ├── core/          类型、端口接口
│   ├── db/            数据持久化
│   ├── provider/      LLM 提供商
│   ├── runtime/       核心运行时（合并 identity/intent/planner/reasoning/execution/reflection）
│   ├── memory/        分层记忆
│   ├── context/       Token 预算管理
│   ├── skills/        技能系统
│   ├── mcp/           MCP 客户端
│   ├── relationship/  关系状态机
│   └── persona/       人格引擎
│
├── apps/
│   └── arete/
│       ├── identity/         # 身份定义
│       ├── knowledge/        # 知识包（从 packages/ 移入）
│       ├── presence/         # 主动消息（从 packages/ 移入）
│       ├── growth/           # 成就（从 packages/ 移入）
│       ├── goals/            # 目标管理（从 packages/ 移入）
│       ├── skills/
│       │   ├── workout-coach/
│       │   ├── nutrition-coach/
│       │   ├── progress-analysis/
│       │   └── search/
│       ├── channels/         # 渠道适配器（从 apps/ 移入）
│       │   ├── web/          # Web UI
│       │   ├── feishu/
│       │   ├── qq/
│       │   ├── wechat/
│       │   ├── telegram/
│       │   └── discord/
│       └── ui/               # Web 界面
│
├── data/              运行数据
├── docs/              文档
└── knowledge-packs/   知识包仓库
```

**对比**:

| 维度 | 当前 | 目标 |
|------|------|------|
| packages/ 数量 | 23 | 10 |
| apps/ 数量 | 7 | 1 |
| 空壳代码 | 存在 | 全部删除 |
| 未使用代码 | 存在 | 全部删除或移入 apps/arete/ |

---

## 八、Pain Driven Development（PDD）

### PDD 流程

```
用户使用 → 感受到 Pain → Pain Log → Issue → Design → Code → Verify → Refactor

         ↓ 循环
       验证是否解决
```

### Step 1: Pain Log

Pain 不是 Bug。Pain 是真实用户在使用时感受到的摩擦。

**Pain Log 模板**:
```markdown
## Pain #001

日期: 2026-07-08
来源: [作者日常使用 | 朋友试用 | 社区反馈]
场景: 我对 Arete 说"帮我定个下周的训练计划"
期望: Arete 能根据我之前的训练历史自动生成一个计划
实际: Arete 回复了通用的 PPL 计划，没有考虑我膝盖不舒服
严重度: ⚠️ 中（可用但有明显缺陷）
```

**Pain 严重度分级**:
- 🔴 阻断（无法继续使用）
- ⚠️ 中（可用但有明显缺陷）
- 🟢 低（不爽但不影响使用）
- 💡 建议（如果能这样就更好了）

### Step 3: Issue

当同一个 Pain 出现 ≥2 次时，从 Pain Log 升级为 Issue。

Pain → Issue 的条件：
- 严重度 🔴 → 立即升级为 Issue
- 同类型 Pain 出现 ≥2 次 → 升级为 Issue
- 💡 建议 → 不升级，累积到 3 次再评估

**Issue 模板**:
```markdown
## Issue: Arete 不会根据训练历史推荐计划

Pain: #001, #015, #032
频率: 3 次 / 2 周
影响: 用户每次都要手动调整计划

方案: [设计文档链接]
```

### Step 3: Design

Issue 升级后，产出最小设计文档。

设计要求：
- 不超过 1 页 A4
- 只回答：改什么、不改什么、怎么验证
- 不讨论未来扩展

### Step 4: Code

编码规则：
- 先测试，后代码
- 一个 PR 只解决一个 Issue
- 不顺手修别的（另一个 Issue 提另一个 PR）

### Step 5: Verify

验证规则：
- 修复后作者在相同场景重新使用 3 天
- 如果 Pain 未消失 → 重新打开 Issue
- 如果 Pain 消失 → 关闭 Issue，记录解决方案

### Step 6: Refactor

当同一模式出现 ≥3 次时，考虑抽象。

抽象条件：
- 同一个代码模式出现在 ≥3 个不同场景
- 且都在 Stage 4 之后
- 且能说出解决了哪个 Pain

### 红线

| 禁止行为 | 后果 |
|---------|------|
| 没有 Pain Log 就写代码 | PR 不合并 |
| 没有 Issue 就写抽象层 | 直接删除代码 |
| 为"以后可能用"加代码 | 不合并 + Code Review 警告 |
| 修复 A 时顺手修 B | 要求拆分 PR |
| 在 Stage 3 之前加通用模块 | 直接拒绝 |

---

## 九、Benchmark（参考对象）

### Memory — 参考 companion-emergence

他们优秀的原因:
- Hebbian 边让记忆之间有关联，不是孤立条目
- Fade/Unfade 生命周期：记忆不简单地"删除"或"保留"
- 每个记忆自带 emotions 和 score，排序有依据

Viraha 学:
- 引入 Hebbian 联想（Stage 2+）
- 引入 Fade 生命周期（Stage 2+）

Viraha 不学:
- 26 维情绪向量（过度设计）
- 所有记忆必须手动标记 emotion

### Presence（主动调度）— 参考 OpenClaw cron 系统

他们优秀的原因:
- 支持 cron 表达式（精确控制）
- 支持 webhook 触发（外部事件唤起）
- 有健康检查和重启保证

Viraha 学:
- 允许 cron 表达式定义发送时机（Stage 1）

Viraha 不学:
- webhook 触发（不是陪伴场景核心需求）
- 多 Agent 路由（单伴侣场景不需要）

### Multi-Platform — 参考 OpenClaw 的渠道体系

他们优秀的原因:
- 23+ 平台支持
- 统一的 WebSocket 网关协议
- 平台适配器插件化

Viraha 学:
- Channel Adapter 抽象（Stage 1+）
- 统一的消息格式

Viraha 不学:
- 23 个平台（只需要飞书/QQ 跑通就够）
- 网关守护进程（Viraha 是编排框架不是独立 App）

### LLM 调用 — 参考 Mastra

他们优秀的原因:
- 模型选择按上下文大小分层
- 异步 Observable Memory（不阻塞响应）
- 原生 MCP 支持

Viraha 学:
- 异步反思（Stage 1）
- 模型分层（Stage 2）

Viraha 不学:
- Workflow 引擎（陪伴不需要步骤编排）

### 关系引擎 — 无参考

这是 Viraha 的原创领域。市场上没有成熟的开源关系引擎设计。

Viraha 应该:
- 从 Arete 的真实使用中验证哪些关系参数有效
- 根据 Pain Log 调整关系模型
- 不要参考任何游戏/社交应用的亲密系统（它们的目标不同）

### 健身领域 — 参考真实教练

他们优秀的原因:
- 个性化（记住每个用户的身体状况）
- 渐进超负荷（有计划地增加强度）
- 恢复意识（知道什么时候该休息）

Viraha 学:
- 把训练历史转化为个性化推荐（Stage 1-2）

Viraha 不学:
- 替代真实教练的医疗建议

---

## 十、执行摘要

### 现在去做什么（Right Now）

1. **测试 `pnpm web` 能否正常启动**。如果不能，修好它。这是 Stage 0 唯一的任务。

2. **打开 Arete 的代码**，理解它当前实际用了 packages/ 中的哪些模块。删除它没用到的 packages/ 中的模块（移入 apps/arete/ 或直接删除）。

3. **跑现有测试**，修复失败的。

### 绝对不要做的事

- 任何新 Skill、MCP 集成、Marketplace、Persona、Scheduler
- 设计"未来 Companion"的通用接口
- 写任何和 Arete 今天需求无关的代码

### 成功标准

六个月内，Viraha 不是以"功能最多"为目标。

成功的 Viraha 是：
- 一个人能用 Arete 在手机上坚持健身 3 个月
- 第二个 Companion 能在 2 天内跑起来
- 整个项目代码量比现在少而不是多
- README 能让新人 30 秒理解并在 3 分钟内跑起来

---

*Viraha Development Strategy v1 — 2026-07-08*  
*下一版更新条件: 完成 Stage 3（100 条 Pain Log）后*
