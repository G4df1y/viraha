# Arete Studio v0.3 产品化设计

> 日期：2026-07-11  
> 状态：待维护者审阅  
> 产品定位：Viraha 的官方健身陪伴参考产品  
> 视觉方向：Quiet Sport Tech 2002

## 1. 决策摘要

Arete 当前已具备聊天、记忆、关系、健身技能、渠道、Trace、隐私和安全边界等核心能力，但实际体验仍是工程演示：

- Web 是 `apps/arete/src/web.ts` 中的单文件页面，只覆盖基本聊天和调试入口。
- CLI 同时承担聊天、配置和诊断，暴露了过多工程细节。
- 飞书与 QQ 的接入说明主要存在于终端和文档，缺少可观察的步骤、状态与恢复入口。
- 安装和自动验证基线无法在当前 Windows + Node 24 环境复现，用户在看到产品前就可能被依赖和运行环境阻断。
- 本地数据中仅有一次约 13 分钟、18 条消息的测试记录，尚未达到连续使用验证阶段。

因此，v0.3 的下一步不是增加新的陪伴能力，而是把现有能力包装成可安装、可配置、可理解和可持续使用的产品。

v0.3 将建设 **Arete Studio**：一个以聊天为主界面、同时整合模型、渠道、记忆和诊断的本地 Web 产品。CLI 退回为启动和维修入口。

模型层同时从“DeepSeek + Anthropic 两个硬编码 Provider”扩展为“通用 OpenAI-compatible 连接层 + 少量必要的专用适配器”。首批提供国内低成本服务预设，并让模型显式声明文本、图像、工具调用和语音转写能力。

## 2. 目标

### 2.1 产品目标

1. 用户从启动 Arete 到完成第一次对话，不需要理解 pnpm、tsx、数据库迁移或手动编辑 `.env`。
2. 模型和消息平台的配置在 Web 中完成，并提供逐步验证和明确恢复动作。
3. 日常聊天、健身计划、记忆来源和运行状态处于同一个连贯产品外壳中。
4. 界面具备明确的 Arete 品牌，而不是通用聊天模板或工程后台。
5. 保留当前 Viraha 运行时、记忆、关系、渠道和安全能力，不借产品化重写核心引擎。
6. 用户可以连接多种国内低成本模型服务，并按价格等级和能力筛选模型。
7. 用户可以发送图像；也可以录制语音，经转写并确认后作为消息发送。

### 2.2 成功标准

在一台安装了受支持 Node.js 版本的干净 Windows 机器上：

- 用户运行 `npm install -g @viraha/arete` 安装发布包，再运行 `arete start`；无需安装 pnpm。
- 启动命令会检查环境、启动服务并打开浏览器。
- 用户可在 10 分钟内完成模型配置、第一次聊天和一次渠道连接测试。
- 凭证通过 Web 安全录入，界面和日志不会回显完整密钥。
- 服务重启后配置、会话、记忆和渠道状态仍然存在。
- 失败时用户能看到原因和下一步动作，而不是堆栈或静默失败。
- 自动化验收覆盖 Windows 启动、首次设置、聊天、渠道测试和隐私边界。
- 模型页至少提供 DeepSeek、硅基流动、通义千问、智谱、Kimi、豆包、MiniMax 和自定义 OpenAI-compatible 预设。
- 发布验收至少使用真实密钥验证 4 个国内 Provider，其中至少一个支持图像输入、一个支持语音转写。
- 图像发送、语音录制、转写确认和不支持能力时的引导均可在产品内完成。

## 3. 非目标

v0.3 不包含：

- 多 Agent、群聊编排、Kanban、工作流或 Agent 市场。
- 通用文件管理器、Web 终端、Coding Agent 或复杂权限系统。
- 桌面应用打包、自动更新和跨平台签名。
- 新的记忆算法、关系算法或复杂的自动模型路由编排。
- 全面重写训练、营养和进展业务逻辑。
- 为第二个 Companion 提前抽象通用产品层。
- 直接复制或派生 LightVela、Hermes Studio 的源码和品牌资产。
- 实时双向语音通话、语音打断、声音克隆和 Assistant 语音合成。
- 视频输入和通用文件问答。

Hermes Studio 仅作为产品结构参考，LightVela 仅作为视觉克制程度参考。

## 4. 用户与核心场景

### 4.1 主要用户

v0.3 的主要用户是自行运行 Arete 的个人维护者，也是日常使用者。产品无需在首版解决多租户运营后台问题。

### 4.2 核心场景

1. 第一次启动并检查运行环境。
2. 从国内 Provider 预设、Anthropic 或自定义 OpenAI-compatible Endpoint 中选择模型服务并验证连接。
3. 直接在 Web 与 Arete 对话。
4. 连接飞书或 QQ，并发送测试消息。
5. 查看 Arete 使用了哪些记忆和健身上下文。
6. 发现模型、渠道或数据库故障并完成恢复。
7. 导出或删除自己的数据。
8. 连接一个国内低成本 Provider，并选择适合文本、图像或语音转写的模型。
9. 上传训练动作、餐食或进展图片，让支持视觉的模型理解图片。
10. 录制一段语音，查看并修正转写文本后再发送。

## 5. 产品结构

Arete Studio 使用一个连续工作台，不再显式划分“用户空间”和“管理空间”。聊天是默认主界面，模型、渠道和诊断是同一侧栏中的一级能力。

### 5.1 主导航

**陪伴**

- 对话
- 今天
- 训练计划
- 饮食记录
- 进展

**能力与连接**

- 记忆
- 模型
- 消息平台

**系统**

- 设置与诊断

v0.3 中完整交付“对话、模型、消息平台、设置与诊断”。其余页面可复用现有数据提供基础视图，但不得阻塞首版发布。

### 5.2 对话页

对话页采用三栏桌面布局：

1. 全局导航侧栏。
2. 会话列表。
3. 聊天工作区。

聊天工作区必须支持：

- 新建、切换和查看会话。
- 流式回复、中断和错误恢复。
- 当前模型选择器。
- 工具调用、记忆使用和计划变更的轻量标签。
- 训练计划等结构化结果的内嵌预览。
- 图像附件预览、移除、上传状态和发送状态。
- 语音录制、停止、转写预览、编辑和确认发送。
- 数据导出和删除入口可从设置页到达。

Trace 不作为普通用户的主界面。默认只显示可理解的状态；详细事件进入“设置与诊断”。

### 5.3 首次设置

首次设置以内嵌向导或右侧面板呈现，不跳转到外部 CLI 流程。

步骤：

1. 检查 Node 版本、数据库目录、写入权限和端口。
2. 选择模型 Provider，录入并验证凭证。
3. 选择使用入口：仅 Web、飞书或 QQ。
4. 完成平台配置，运行权限和连接检查。
5. 发送测试消息，确认入站、回复和 Trace 回执。
6. 进入对话页。

设置完成后，后续启动默认直接进入对话页。未完成项通过侧栏状态和非阻塞提示继续呈现。

### 5.4 模型页

模型页以 Provider 为单位显示：

- 已配置或未配置。
- 当前默认模型。
- Provider 类型：官方预设或自定义 OpenAI-compatible。
- 模型能力：文本、图像、工具调用、流式输出、语音转写。
- 成本等级：低、标准、高；只作为选择提示，不展示可能迅速过期的硬编码精确价格。
- 最近一次验证结果和时间。
- 保存、重新验证和移除操作。
- 失败原因和建议动作。

前端只能读取密钥是否存在和脱敏摘要，不能读取完整密钥。

首批国内预设：

- DeepSeek
- 硅基流动 SiliconFlow
- 阿里云百炼 / 通义千问
- 智谱 BigModel / GLM
- Moonshot / Kimi
- 火山方舟 / 豆包
- MiniMax
- 自定义 OpenAI-compatible Endpoint

尽量通过统一的 OpenAI-compatible Adapter 接入。只有鉴权、消息结构、工具调用或流式协议确实不兼容时，才增加专用适配器。模型列表优先从 Provider 查询；不支持模型发现时允许手动填写模型 ID。

### 5.5 图像与语音输入

**图像输入**

- 支持从文件选择器、拖放或粘贴板添加图片。
- 发送前显示缩略图、文件大小和移除操作。
- 只有视觉能力明确可用时允许发送；不自动把图片转发给另一个模型。
- 模型不支持图像时，提示用户选择支持视觉的模型或移除附件。
- 适用场景包括动作姿势、餐食、器械环境和进展照片，但 Arete 仍不得把图片判断表述为医疗诊断。

**语音输入**

- 浏览器使用 MediaRecorder 录音。
- 录音上传到本地服务，由已配置的语音转写模型处理。
- 转写结果先填入输入框，用户可以编辑后再发送。
- 原始录音默认在转写结束或失败清理后删除，不进入长期记忆。
- 语音转写失败不影响当前草稿，用户可以重试或改用文字。

### 5.6 消息平台页

飞书和 QQ 以平台行或平台卡呈现，优先显示状态而不是长篇教程：

- 未配置。
- 配置未完成，并显示剩余步骤。
- 正在连接。
- 已连接。
- 连接失败，并显示原因和重试动作。

打开平台后使用步骤面板：

1. 创建平台应用。
2. 填入凭证。
3. 检查权限和订阅项。
4. 保存配置。
5. 启动连接。
6. 发送测试消息并验证回执。

外部文档只作为补充链接，不能替代产品内指引。

### 5.7 设置与诊断页

设置与诊断页集中展示：

- 应用版本和受支持运行环境。
- 数据库状态和数据路径。
- Provider 健康状态。
- 飞书和 QQ 连接状态。
- Scheduler 状态。
- 最近高优先级错误。
- 导出数据和删除数据。
- 下载脱敏诊断报告。

高级 Trace 可作为可展开区域，默认不向普通使用流程暴露事件内部结构。

## 6. 视觉系统

### 6.1 方向

视觉方向为 **Quiet Sport Tech 2002**：以 2000 年代运动科技、MiniDisc、数码相机和硬件仪表为致敬来源，但使用现代布局、可读性和交互规则。

### 6.2 保留的 Y2K 元素

- 银灰和冷白的硬件面板感。
- 钴蓝主操作色。
- 酸性绿仅用于在线、通过和安全状态灯。
- 珊瑚红仅用于危险和失败。
- 编号导航，如 `01 对话`、`02 今天`。
- 等宽字体用于版本、模型、状态和事件元数据。
- 小型状态灯、内嵌按钮和设备标签。
- 紧凑、规则、略带工业产品说明书感的信息组织。

### 6.3 明确排除

- 粗黑描边。
- 霓虹色大面积铺满。
- 扫描线、故障字符和无意义终端动画。
- 正文使用像素字体。
- 复杂金属渐变、玻璃拟态和装饰性光晕。
- 为复古感牺牲对比度、字号、键盘操作或移动端可读性。

### 6.4 基础令牌

- 背景：冷白、浅银灰、中性灰绿。
- 文字：近黑主文字、中灰辅助文字。
- 主操作：钴蓝。
- 成功：酸性绿，仅用于小面积状态。
- 危险：珊瑚红。
- 边框：1px 中性灰，不使用粗描边。
- 圆角：3-6px，卡片不超过 8px。
- 正文字体：系统无衬线字体。
- 元数据字体：系统等宽字体。
- 字距：0。

组件优先使用 Lucide 图标。只有清晰命令使用文字按钮；工具操作优先使用图标按钮和 Tooltip。

## 7. 技术架构

### 7.1 总体选择

保留 Arete 现有 Hono 服务和 Viraha packages，新建组件化前端：

```text
apps/arete/
  src/
    index.ts              server bootstrap
    web.ts                reduced to API/static hosting composition
    api/                  route modules
    services/             bootstrap/config/diagnostics services
  web/
    src/
      app/                routing and application shell
      components/         shared UI primitives
      features/
        chat/
        setup/
        models/
        channels/
        diagnostics/
      styles/             tokens and global styles
```

前端采用：

- Vite
- React
- TypeScript
- React Router
- Lucide React
- 原生 Fetch、SSE、MediaRecorder 和小型本地 hooks

v0.3 不引入大型状态管理或通用组件库。服务端状态通过功能内 hooks 管理；只有跨页面的当前会话、当前模型和启动状态进入顶层 Context。

### 7.2 服务端职责

Hono 服务继续负责：

- 调用 AgentPipeline。
- 会话、记忆、关系和健身数据持久化。
- Provider 和渠道连接。
- 凭证保存和脱敏。
- 诊断检查。
- 静态前端资源托管。

前端不得直接访问 SQLite、`.env`、渠道 SDK 或 Provider SDK。

### 7.3 `web.ts` 迁移

`apps/arete/src/web.ts` 不再包含完整 HTML、CSS 和浏览器脚本。迁移完成后，它只负责：

- 注册 API 路由。
- 提供构建后的前端静态文件。
- 提供 SPA fallback。

现有 API 在迁移期间保持兼容。新界面先调用现有聊天、Trace、隐私和健康接口，再为首次设置补充窄范围 API。

### 7.4 Provider 与模型能力

当前 `LLMProvider` 只接收字符串消息，`ProviderRegistry.listModels()` 也把所有模型统一标记为 `chat`。v0.3 需要新增两个边界：

1. **Provider Adapter**：负责鉴权、Endpoint、模型发现、聊天、流式响应、工具调用和语音转写协议。
2. **Model Capability Catalog**：记录每个模型是否支持文本、图像、工具调用、流式输出和语音转写，以及成本等级和上下文窗口。

建议类型：

```ts
type ModelCapability =
  | "text"
  | "vision"
  | "tools"
  | "streaming"
  | "speech-to-text"

interface ModelInfo {
  id: string
  provider: string
  capabilities: ModelCapability[]
  contextWindow?: number
  costTier?: "low" | "standard" | "high"
}
```

Provider 预设包含显示名称、默认 Base URL、鉴权方式、是否支持模型发现和已知能力覆盖。用户可以覆盖 Base URL 和模型 ID，但不能在浏览器端直接拼接任意请求头脚本。

当 Provider 返回的模型信息不足时，能力目录使用仓库维护的显式映射。未知模型默认只具备文本能力，避免把图片或音频误发给不支持的端点。

### 7.5 多模态消息

将纯字符串 `ChatMessage.content` 扩展为结构化内容片段，同时兼容现有文本调用：

```ts
type MessageContentPart =
  | { type: "text"; text: string }
  | { type: "image"; attachmentId: string; mimeType: string }

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string | MessageContentPart[]
}
```

音频在 v0.3 不直接进入 AgentPipeline。它先通过独立语音转写接口产生可编辑文本，再按普通文本消息进入聊天流程。

附件由服务端保存到按用户隔离的本地目录，并在数据库中记录所有者、MIME、大小、哈希、创建时间和删除状态。Provider Adapter 负责把附件转换为目标 API 所需的 Base64、Data URL 或内容块格式。

## 8. 数据流

### 8.1 启动

```text
arete start
  -> arete doctor preflight
  -> migrate/init database
  -> start Hono on loopback
  -> open browser
  -> GET /api/bootstrap/status
  -> setup incomplete ? show setup : show chat
```

默认只监听 `127.0.0.1`。如果未来允许局域网访问，必须单独增加认证和明确配置，不在 v0.3 默认开启。

### 8.2 模型配置

```text
browser form
  -> POST provider test
  -> server calls provider endpoint
  -> return redacted result
  -> user confirms save
  -> server atomically persists secret
  -> refresh provider health
```

测试与保存分离，避免无效凭证直接覆盖可用配置。

### 8.3 渠道配置

```text
platform step panel
  -> save credentials server-side
  -> validate platform API
  -> start/restart adapter
  -> send or wait for test message
  -> correlate inbound/reply/receipt events
  -> return user-readable pass/fail status
```

### 8.4 聊天

```text
composer
  -> chat stream endpoint
  -> AgentPipeline
  -> memory/relationship/knowledge/skills
  -> token stream
  -> final reply + metadata summary
  -> async reflection and relationship update
```

界面只显示有用户价值的元数据，如使用了记忆、生成了训练调整或触发安全边界。完整事件仍写入 EventStore。

### 8.5 图像输入

```text
select / drop / paste image
  -> client validates type and size
  -> POST attachment to local server
  -> server validates bytes and stores by user id
  -> return attachment id + thumbnail metadata
  -> selected model capability check
  -> AgentPipeline receives text + image reference
  -> Provider Adapter creates provider-specific multimodal payload
  -> reply stream
```

上传成功不等于消息已发送。用户在发送前移除图片时，未被其他消息引用的临时附件应被清理。

### 8.6 语音输入

```text
record in browser
  -> local upload
  -> speech-to-text Provider
  -> return transcript
  -> delete temporary audio
  -> user edits and confirms
  -> send as ordinary text message
```

转写结果不得在用户确认前自动发送或写入长期记忆。

## 9. 配置与安全

### 9.1 运行环境

v0.3 明确支持 Node.js 22 LTS。CLI 在启动前检查版本，对 Node 24 等未验证版本给出明确错误和安装指引。

用户不需要 pnpm。开发仓库仍可使用 pnpm，但 `@viraha/arete` 发布包必须包含服务端、前端和数据库迁移所需的运行构建产物，并通过 package `bin` 暴露 `arete` 命令。

### 9.2 凭证

- 凭证只由本地服务接收和保存。
- API 不返回完整凭证。
- 日志、Trace 和诊断报告继续使用现有脱敏逻辑。
- 写入采用临时文件加原子替换，避免中断产生半写配置。
- 保存失败时保留上一份可用配置。
- UI 不将凭证写入 Local Storage、URL 或浏览器日志。

### 9.3 本地边界

- 默认绑定 loopback。
- 配置写入 API 只接受同源请求。
- 删除数据继续要求明确二次确认。
- 错误响应不暴露密钥、Cookie、签名或完整本地路径。

### 9.4 附件与录音

- 图片只接受明确 allowlist 的 MIME 类型，并验证真实文件签名，不能只信任扩展名。
- 设置单文件和单次请求大小上限，超限在上传前后均拒绝。
- 附件路径由服务端生成，不接受用户提供的目标路径。
- 图片按用户隔离，不能通过猜测 attachment id 读取他人文件。
- 删除用户数据时同时删除附件、缩略图和未完成上传。
- 数据导出升级为包含 JSON 和用户附件的归档文件。
- 语音原始文件默认临时保存并在转写完成、失败或超时后删除。
- 图片和语音只有在用户明确发送或触发转写时才会发送给所选 Provider。

## 10. 错误处理

所有错误必须映射为：

1. 发生了什么。
2. 哪个步骤失败。
3. 用户可以执行的下一步。
4. 是否保留了之前的可用状态。

典型示例：

- Node 版本不支持：阻止启动，给出受支持版本。
- 数据目录不可写：阻止启动，显示目标目录和修复建议。
- Provider 验证失败：不保存新密钥，保留旧配置。
- 渠道权限不足：列出缺失权限和平台页面入口。
- 渠道断线：显示重连状态，进程继续运行。
- 聊天失败：保留用户输入，允许重试，不创建重复消息。
- 数据删除失败：显示未删除范围并写入高优先级事件。
- 所选模型不支持图像：阻止发送，保留文字和附件草稿，提示选择兼容模型。
- 图片上传失败：保留文字草稿，显示文件级重试或移除操作。
- 语音权限被拒绝：说明如何重新授权，并保留文字输入能力。
- 语音转写失败：删除临时录音或提供一次明确重试，不自动发送空消息。
- Provider 模型发现失败：保留已保存模型和手动模型 ID 入口，不让整个模型页失效。

用户界面默认不显示堆栈。诊断报告可以包含脱敏后的技术细节。

## 11. 测试与验证

### 11.1 单元测试

- 配置解析、原子写入和回滚。
- 密钥脱敏和 API 响应序列化。
- Node 版本与运行环境检查。
- 平台步骤状态映射。
- 前端设计令牌和关键 UI 状态。
- 模型能力匹配和未知模型的保守默认值。
- 多模态消息到 Provider 请求格式的转换。
- 附件所有权、MIME 验证、大小限制和临时录音清理。

### 11.2 集成测试

- Bootstrap 状态接口。
- Provider 测试与保存分离。
- 通用 OpenAI-compatible Provider 的聊天、流式、工具和模型发现契约。
- 国内 Provider 预设的 Base URL、鉴权和能力覆盖。
- 渠道验证、失败和重试。
- 服务重启后的配置恢复。
- 现有隐私、数据导出和删除行为。
- 图片上传、消息引用、导出和级联删除。
- 语音录制上传、转写、确认前不发送和临时文件清理。

### 11.3 浏览器端到端测试

- 首次启动进入设置向导。
- 完成模型配置后进入聊天。
- 发送消息并看到流式回复。
- 使用视觉模型发送图片并看到附件预览和回复。
- 选择文本模型时，图片发送被阻止且草稿得到保留。
- 录制语音、完成转写、编辑文本并发送。
- 打开消息平台页并完成模拟连接测试。
- Provider 或渠道失败时显示恢复动作。
- 删除数据需要明确确认。
- 桌面和移动视口无重叠、溢出或不可点击控件。

### 11.4 发布验证

- Windows CI 使用 Node 22 从发布包安装，不依赖仓库内 `node_modules`。
- 运行 `arete doctor`、`arete start` 和浏览器 smoke test。
- 执行 build、test、lint、smoke eval 和 crisis eval。
- 使用真实 Provider 完成一次手工聊天。
- 使用至少 4 个国内 Provider 完成真实连接验证。
- 使用真实视觉模型完成一次图片输入。
- 使用真实语音转写模型完成一次录音转写。
- 使用真实飞书或 QQ 完成一次入站、回复和 Trace 回执。
- 对桌面与移动视口进行截图检查。

## 12. 交付顺序

### Slice 0：可重复启动基线

- 固定并检查 Node 22 LTS。
- 修复 Windows 不兼容脚本。
- 建立可通过 `npm install -g @viraha/arete` 安装的发布包，不依赖 pnpm 和仓库 `node_modules`。
- 提供 `arete start`、`arete doctor`、`arete logs`。

### Slice 1：Arete Studio 外壳

- 建立 Vite + React 前端。
- 落地 Quiet Sport Tech 2002 设计令牌和组件。
- 完成导航、会话栏和响应式布局。

### Slice 2：聊天迁移

- 迁移现有聊天、流式响应和错误状态。
- 增加会话列表和有用的记忆/工具摘要。
- 保持现有 AgentPipeline 行为不变。

### Slice 3：国内 Provider 与模型能力层

- 实现通用 OpenAI-compatible Provider Adapter。
- 建立模型能力和成本等级目录。
- 提供 DeepSeek、硅基流动、通义千问、智谱、Kimi、豆包、MiniMax 和自定义 Endpoint 预设。
- 完成模型发现、手动模型 ID、连接测试和能力筛选。

### Slice 4：图像与语音输入

- 建立用户隔离的附件存储和清理机制。
- 完成图像选择、拖放、粘贴、预览和视觉模型发送。
- 完成浏览器录音、语音转写、文本确认和临时录音删除。
- 将附件纳入数据导出和删除链路。

### Slice 5：首次设置与渠道

- 完成 Bootstrap 状态和设置向导。
- 将 Provider 选择、低成本推荐和能力筛选接入向导。
- 完成飞书和 QQ 步骤面板及连接测试。

### Slice 6：诊断与发布门槛

- 完成设置与诊断页。
- 完成 Windows 安装和浏览器端到端验证。
- 完成真实 Provider、真实渠道和人工视觉验收。

每个 Slice 必须形成可运行的纵向结果，不允许先搭建大量空页面再补行为。

## 13. 风险与控制

### 引入新前端框架

风险：增加构建和依赖复杂度。  
控制：只引入 React、Router 和 Lucide；不引入大型状态管理或组件库；保持 Hono API 不变。

### 国内 Provider 接口差异

风险：虽然许多服务声称兼容 OpenAI，模型发现、工具调用、图像消息和流式事件仍可能存在差异。  
控制：通用 Adapter 只覆盖共同协议；差异通过显式 Provider 预设和小型专用转换处理；每个发布预设必须有契约测试和真实连接记录。

### 价格信息过期

风险：在 UI 中硬编码精确价格会快速失真。  
控制：v0.3 只维护低、标准、高成本等级和“低成本推荐”标记；精确价格链接到 Provider 官方页面，不用于自动计费判断。

### 多模态数据隐私

风险：图片和录音比纯文本更敏感，也更容易出现跨用户读取和删除遗漏。  
控制：服务端生成附件 ID、按用户隔离、默认删除临时录音、附件进入导出/删除验收，并记录对外发送的 Provider 与时间。

### 产品化范围膨胀

风险：照搬 Hermes Studio 的广泛能力。  
控制：v0.3 只完整交付聊天、模型、渠道和诊断；其余能力不阻塞发布。

### 复古视觉影响可用性

风险：Y2K 元素降低可读性或造成视觉疲劳。  
控制：复古元素限制在状态、边框、编号和元数据；正文和表单遵循现代可访问性规则。

### 安装环境差异

风险：Node、原生依赖和包管理器导致启动失败。  
控制：固定 Node 22 LTS，发布包不要求 pnpm，Windows CI 从干净环境安装验证。

## 14. 最终下一步行动

项目的下一步行动仍是执行 **Slice 0：可重复启动基线**，随后立即交付 **Slice 1 的可运行 Arete Studio 外壳**。Provider 扩展和多模态输入在外壳与聊天迁移稳定后，以独立纵向 Slice 交付。

在这两项完成前，不继续增加记忆、关系、健身技能、第三方生态或桌面打包能力。

进入一周个人真实使用验证的条件是：

1. 干净 Windows 环境可以稳定启动。
2. 用户不编辑 `.env` 即可完成模型配置。
3. 至少 4 个国内 Provider 已完成真实连接验证，并能清楚筛选低成本模型。
4. 新聊天界面可以发送文字、图像，并完成语音转写后发送。
5. 至少一个真实消息平台可用。
6. 错误可以在产品内理解和恢复。
7. 维护者愿意主动打开 Arete，而不是为了测试而使用。
