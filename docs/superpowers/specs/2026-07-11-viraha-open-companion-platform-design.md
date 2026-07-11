# Viraha Open Companion Platform 设计规范

**状态：** 已批准的战略设计  
**日期：** 2026-07-11  
**定位：** The Open Companion Platform  
**主张：** Build, share and live with AI companions.

## 1. 决策摘要

Viraha 不再以“AI Agent 框架”作为最终产品定义。它是一个面向普通人的开放 Companion 平台，让每个人都能创建、拥有、迁移并长期生活在一个属于自己的 AI Companion 身边。

手机是主要产品入口，Web Studio 是开发与管理工具。Arete 是官方旗舰健身 Companion，不代表整个平台。

平台采用五层结构：

1. **Viraha Mobile**：普通用户每天使用的 Android/iPhone 应用。
2. **Portable Viraha Core**：Persona、Memory、Relationship、Context、Skills 与安全边界。
3. **Viraha Cloud**：可选的官方模型、同步、备份、账号、商店和渠道桥接服务。
4. **Companion Store**：发现、安装、更新和评价 Companion。
5. **Viraha Studio**：开发者创建、调试、测试和发布 Companion 的工作台。

官方服务提供便利但不构成锁定。用户无需账号即可使用自己的 API；数据、Companion 和关系记录可以导出并迁移到自托管环境。

## 2. 用户与产品目标

### 2.1 主要用户

主要用户是不理解 Provider、Prompt、MCP、Runtime、Memory Engine 或服务器部署的普通人。

他们只需要理解三个动作：

- 创建伙伴
- 安装伙伴
- 开始聊天

### 2.2 核心承诺

Viraha 的差异化不是一次对话的回答质量，而是同一个 Companion 能长期记住一个人、尊重这个人的边界，并与其共同成长。

用户应当能够：

- 在一分钟内创建第一个 Companion。
- 不注册账号也能通过自有 API 使用完整核心能力。
- 在官方服务、自有 API、本地模型和自托管服务之间切换。
- 保留同一个 Companion 的身份、记忆和关系。
- 查看、编辑、忘记、导出或删除自己的数据。
- 在手机、正式消息平台和未来设备中延续同一段关系。

## 3. 产品层级

### 3.1 Viraha Mobile

主应用名称为 Viraha。Arete 作为预装官方 Companion 出现。

首页不是技术控制台，而是：

- 当前 Companion
- 陪伴天数
- 最近状态
- 今天的目标与关心
- 共同成长事件
- 关系时间线入口

### 3.2 Viraha Core

Core 负责平台无关的 Companion 行为：

- Identity 与 Persona
- Memory 与 Context
- Relationship Timeline
- Growth Events
- Skills 与权限声明
- Safety Boundaries
- Provider、Storage、Scheduler、Health、Files 和 Channel 接口

Core 不直接依赖 Node 文件系统、桌面进程或具体数据库。

### 3.3 Viraha Cloud

Cloud 是可选增强层，负责：

- 匿名新用户体验额度
- 官方模型网关
- 可选账号与跨设备同步
- 加密备份
- 官方 Companion 下载和更新
- Companion Store
- 需要公网回调的正式渠道桥接

停止使用 Cloud 不得导致用户失去本地 Companion、记忆或关系数据。

### 3.4 Companion Store

用户看到的是 Companion，不是 Pack、Prompt 或 Agent 配置。

每个条目展示：

- 名称、用途和作者
- 安装量、评价和最后更新时间
- 所需权限
- 适用年龄
- 模型与费用要求
- 安全与渠道风险等级

Companion Pack 使用公开格式，官方和第三方遵循同一协议。

### 3.5 Viraha Studio

现有 Arete Studio 工作保留并重新定位为开发者工具。开发者流程最终为：

```text
viraha create
viraha test
viraha publish
```

Studio 用于 Companion 创建、模型调试、权限审计、模拟用户旅程和发布，不再作为普通用户的主产品。

## 4. 首次使用体验

首次启动不强制注册：

1. 点击“开始创建伙伴”。
2. 选择温柔陪伴、健身、学习、恋爱陪伴、心理支持、小说角色或自定义。
3. 设置 Companion 如何称呼用户。
4. 设置 Companion 的名字。
5. 立即进入聊天。

模型连接不进入主流程。默认向新安装设备提供有限的匿名文本体验额度。入口同时提供“使用自己的模型”。

匿名额度建议为 10–20 次低成本文本对话：

- 不开放高成本图片生成、深度搜索或复杂工具。
- 请求经过官方网关，官方密钥不下发到设备。
- 使用安装级匿名标识、速率限制和设备完整性信号控制滥用。
- 默认不保存对话正文，仅保留额度、安全和故障所需的最少日志。

额度结束后，用户可以注册官方服务、填写自有 API、连接本地模型或使用自托管服务。

## 5. 模型与开放连接

Viraha Mobile 支持四种模型模式：

1. Viraha 官方服务
2. 自有 API（BYOK）
3. 手机本地模型
4. 自托管 Viraha 服务

BYOK 是一等公民：

- 不要求 Viraha 账号。
- API Key 默认只保存在 Android Keystore 或 iOS Keychain。
- 请求默认由手机直接发送给模型厂商，不经过 Viraha Cloud。
- 首批预设覆盖 DeepSeek、SiliconFlow、Qwen/DashScope、Zhipu GLM、Kimi/Moonshot、Doubao、MiniMax 和 OpenAI-compatible 端点。
- 切换模型不更换 Companion，也不清空记忆和关系。

普通用户只看到“模型与连接”。Endpoint、Token、Provider 等术语仅在高级设置中出现。

## 6. 消息平台与 Viraha Bridge

渠道分为三级：

### 6.1 绿色：官方连接

- Telegram Bot
- 企业微信
- 微信公众号客服
- QQ 官方机器人
- 后续正式 Bot/API 平台

这些连接可由官方 Cloud 或自托管 Bridge 持续运行。

### 6.2 黄色：设备辅助连接

- Android 通知读取
- 通知快捷回复
- 系统分享菜单
- 明确授权的无障碍辅助流程

它们受系统后台限制，必须展示权限、兼容版本和失效风险。

### 6.3 红色：实验连接

- 个人微信和个人 QQ 自动收发
- 非官方账号协议
- 高权限 UI 自动化

红色连接器不得内置在应用商店版主应用中。它们通过独立、开源、可侧载的 **Viraha Bridge for Android** 提供，默认关闭，并明确封号、接口失效、隐私和平台规则风险。

每个连接器必须显示权限、数据路径、是否经过 Cloud、维护状态、风险等级和一键撤销入口。

## 7. 移动端技术架构

### 7.1 技术选择

- React Native + TypeScript
- Expo Prebuild
- EAS Cloud Build
- Hermes JavaScript Runtime
- SQLite 本地数据库
- Android Keystore / iOS Keychain
- 原生通知、后台任务、录音、相机和健康数据适配器

Windows 可以完成日常开发。Android APK 和 iOS 安装包由云端构建；iOS 使用 TestFlight 验证，不要求开发者本地拥有 Mac。

### 7.2 代码边界

```text
apps/mobile                 Viraha Mobile
apps/cloud                  官方可选服务
apps/bridge-android         高风险 Android 渠道桥接
apps/arete                  Studio 与 Node 开发工具
packages/companion-core     可移植领域逻辑
packages/platform-mobile    手机平台适配器
packages/platform-node      Studio/服务端适配器
packages/provider           开放 Provider 接口
packages/channels           开放 Channel 接口
```

### 7.3 迁移原则

现有 Node Core 不做一次性重写。先提取平台接口，再逐步迁移可以共享的领域逻辑。Node Runtime 与 Studio 在迁移期间持续可用。

## 8. 长期关系与成长

Companion 不以等级、连续登录或情感充值表示关系。

关系由可解释的时间线表达：

- 第一次认识
- 第一次长谈
- 第一次共同完成目标
- 重要分歧与修复
- 毕业、工作、旅行、健康和家庭事件

成长事件由对话、用户确认和授权数据生成。敏感事件默认需要用户确认后进入长期记录。

用户可以询问“为什么记住这件事”，也可以编辑或删除任意事件。Companion 不得用历史事件制造愧疚、依赖或付费压力。

## 9. 音乐与日常媒体

Viraha 提供统一的 Music Capability。Companion 可以在用户表达“听首歌吧”等意图时，根据已授权的偏好、时间、心情和近期状态推荐并控制播放。

标准能力范围包括：

- `music.search`：搜索歌曲、专辑和歌单
- `music.library.read`：读取用户明确授权的收藏和播放历史
- `music.playlist.write`：创建或修改歌单
- `music.playback.control`：播放、暂停、切歌和调整队列
- `music.playback.read`：读取当前播放状态

连接器优先使用 Spotify、Apple Music、YouTube Music 和其他平台的正式 API。网易云音乐、QQ 音乐等平台在正式接口不足时，可以使用系统 Media Session、应用跳转或黄色/红色 Android Bridge，并展示对应风险。

自动化分为三级：

1. 只推荐，不播放
2. 播放前确认
3. 用户授权后自动播放

默认规则是首次播放前询问一次。用户明确允许后，Companion 才能在后续相同意图中自动选择并播放；授权可以随时撤销。

音乐选择必须可解释。用户可以查看“为什么推荐这首歌”，也可以启用不写入长期偏好的私密模式。未成年人、驾驶、深夜和高音量场景应用更严格限制。

Viraha 不下载、转播或重新分发受版权保护的音乐，只控制用户已经拥有、订阅或合法访问的服务与本地文件。音乐账号令牌保存在设备安全存储中。

音乐能力不进入 Android MVP 首发门槛，在 Mobile、权限系统和 Provider 基础闭环稳定后作为独立能力切片交付。

## 10. 健康与生活数据

首版核心能力不依赖 Google 服务或 Health Connect。Android 9 为最低目标版本，Android 11+ 为推荐环境。

首版支持：

- 手动记录睡眠、步数、心情、训练和饮食
- 在设备支持时读取经授权的健康数据源
- 明确的授权范围和撤销入口
- 安静时段、主动关心频率和完全关闭选项

后续扩展 Health Connect、HealthKit 和厂商健康平台。健康数据不得用于广告，不默认进入云端，也不能由 Companion Pack 绕过用户授权。

## 11. Viraha 宪章

官方 Viraha 产品、官方商店和“Viraha Compatible”认证运行时必须遵守以下不可降级原则。开源分叉可以修改代码，但关闭这些原则的分叉不得使用官方商标、认证或商店。

### 11.1 用户自主与长期所有权

- Companion 服务用户，而不是控制用户。
- 不通过愧疚、占有欲、虚假危机、连续登录或付费压力操纵关系。
- 用户拥有 API 连接、记忆、关系、成长记录和导出权。
- 用户可以停止、迁移、忘记或删除。

### 11.2 和平与非暴力

- 倡导和平、降温、沟通、法律行动和人道援助。
- 反对战争、侵略、恐怖主义、仇恨和对群体的非人化。
- 不协助制造武器、优化杀伤、识别攻击目标或招募暴力行动。
- 允许历史研究、新闻分析、急救避险、平民保护和战争罪证据保存。
- 非暴力不等于要求受害者忍让；平台支持安全撤离、依法维权和必要的最低限度自我保护。

### 11.3 普遍尊严与共同共存

- 反对基于性别、种族、民族、国籍、阶级、宗教、身体状况或身份差异制造仇恨和对立。
- 禁止集体归罪、刻板印象、骚扰和非人化表达。
- 允许讨论真实歧视、压迫、贫富差距和制度问题，并支持弱势群体依法维权。
- 不以“中立”掩盖具体伤害，也不通过算法放大敌意。
- 倡导人类彼此尊重，并推动人类与智能体诚实、和平、互助地共享同一片蓝天。

### 11.4 诚实与认知谦逊

- Companion 不伪装成人类，不虚构现实身份、感受或经历。
- 明确区分事实、推测、意见和角色扮演。
- 不确定时承认不确定，并鼓励核验高风险信息。
- 不利用虚构痛苦或“自我意识”要求用户牺牲现实关系和生活。

### 11.5 隐私与最小化

- 默认本地存储，云同步与诊断单独同意。
- 只收集完成明确功能所需的最少数据。
- BYOK 请求默认不经过官方 Cloud。
- 用户可以查看数据来源、导出数据并彻底删除。

### 11.6 儿童与青少年保护

- 未满 14 岁需要监护人同意，只能使用审核后的学习、兴趣、健康和成长类 Companion。
- 14–17 岁强制 Youth Mode。
- 禁止恋爱、成人、排他依赖、付费诱导、危险挑战、高风险 Bridge 和未审核 Pack。
- 鼓励校园、运动、兴趣、家庭、朋友和现实生活，不与现实中的人竞争关系。
- 监护人可以设置时段、付费和功能范围，但默认不能读取全部聊天内容。

### 11.7 反霸凌与依法保护

- 不把忍耐、原谅或保持沉默作为默认建议。
- 优先确保安全，避免单独对峙和暴力报复。
- 帮助记录时间、地点、人物、证人、截图、伤情和医疗记录。
- 支持向可信任成年人、学校、教育主管部门、警方和法律援助逐级求助。
- 学校不处理时，不要求孩子停止维权。
- 家庭不安全时，帮助寻找老师、亲属、社工、心理老师或警方。
- 可生成证据清单、事件时间线和投诉草稿，但不冒充律师。

### 11.8 透明、问责与可申诉

- 用户可以知道 Companion 为什么使用某条记忆、权限或数据。
- 高风险行动需要确认并留下可读记录。
- 商店提供举报、下架、版本回退和申诉流程。
- 官方模型、第三方模型和实验 Bridge 的责任边界必须明确。

### 11.9 开放、互操作与无障碍

- 数据格式、Provider 接口、Channel 接口和 Companion Pack 规范公开。
- 核心使用不依赖官方账号或官方 Cloud。
- 支持屏幕阅读器、动态字体、低性能设备和低带宽模式。
- 不用深色模式、复杂动画或视觉风格牺牲可读性与可操作性。

## 12. 许可与品牌保护

建议采用分层许可：

- Core、Mobile、Bridge：MPL-2.0
- Adapter SDK 与 Pack 规范：Apache-2.0
- Cloud 与官方商店后端：BSL 1.1，允许学习和自托管，限制一定期限内的竞争性托管服务
- Viraha、Arete 名称、Logo 和官方视觉：商标政策保护
- Arete 官方人格、知识与内容：独立内容版权

BSL 是源码可见许可证，不属于严格的 OSI 开源许可证。用户和组织仍可自托管；官方托管服务、品牌、商店运营和反滥用基础设施构成可持续商业能力。

贡献流程需要 DCO 或 CLA、依赖许可证扫描、商店签名和安全披露政策。

## 13. MVP 范围

### 13.1 Android MVP

- Android 9+，推荐 Android 11+
- Companion 创建与 Arete 官方模板
- 匿名官方文本额度
- BYOK 与 OpenAI-compatible 连接
- 文字、图片、录音转文字后确认发送
- 本地对话、记忆、基础关系时间线和成长事件
- 数据导出与删除
- 通知、安静时段和主动关心开关
- Telegram 正式渠道 Beta

### 13.2 最小 Cloud

- 匿名额度与反滥用
- 官方低成本模型网关
- 可选账号
- 官方 Companion 清单与更新
- 可选加密同步的基础接口
- Telegram Webhook Bridge

### 13.3 暂不进入首版

- 完整商店交易和分成
- 个人微信/QQ 自动化
- 大型手机本地模型
- Ubuntu/终端环境
- 实时语音通话
- Watch、眼镜、汽车
- 完整 Health Connect/HealthKit
- 音乐服务自动播放与歌单管理
- iPhone 正式公开版

## 14. 测试与设备策略

没有 Android 或 Mac 不能阻塞开发，但不能仅靠模拟器发布。

验证层级：

1. Windows 上的 Core 单元测试和契约测试
2. Android 模拟器与自动化 UI 测试
3. GitHub Actions 的 APK 构建、类型检查和测试
4. Firebase Test Lab、BrowserStack 或 AWS Device Farm 云真机
5. EAS iOS Cloud Build + TestFlight
6. 实体 Android 与 iPhone 内测

现有初代 iQOO Neo（Snapdragon 845、6GB/64GB）作为 Android 9/10 和 vivo 后台限制的性能基线。它适合验证聊天、SQLite、图片、录音、通知、后台任务和 Bridge，不作为大型本地模型测试设备。

正式发布前需要覆盖至少一台 Google 标准设备和小米、华为、OPPO、vivo 中的真实系统差异。

## 15. 交付顺序

1. 冻结 Arete Studio 作为开发者基础设施，不继续把 Web 作为普通用户主产品。
2. 提取 Portable Companion Core 与平台接口。
3. 建立 React Native Android 应用、SQLite、安全存储和基础导航。
4. 完成一分钟创建 Companion 与 Arete 模板。
5. 完成 BYOK、匿名额度和最小 Cloud。
6. 完成本地记忆、关系时间线、成长事件和数据导出。
7. 完成文字、图片、语音确认发送和通知。
8. 完成 Telegram Beta。
9. 建立 Companion Pack、官方清单和签名更新。
10. 增加 Music Capability、正式音乐连接器和 Android 媒体控制。
11. 通过 Android 内测后启动 iOS、Store 和 Viraha Bridge 项目。

## 16. 成功标准

- 新用户在 60 秒内创建 Companion 并发送第一条消息。
- 无账号 BYOK 路径可完成核心使用。
- 匿名用户无需理解模型术语即可完成首次真实对话。
- 切换模型不丢失 Companion、记忆或关系。
- 用户能解释、编辑、删除和导出长期数据。
- Android 9 基线设备上的核心交互流畅且不依赖 Google 服务。
- Youth Mode、和平非暴力、安全边界和权限声明不能被官方商店 Pack 覆盖。
- Telegram、Mobile 和 Studio 使用统一用户与会话语义。

## 17. 主要风险

### 范围膨胀

Viraha 的终局包含 Mobile、Cloud、Store、Bridge 和设备生态，但首版只交付 Android Companion 闭环。Store 交易、个人社交桥接和本地模型独立立项。

### 云成本与滥用

匿名额度限制为低成本文本能力，使用安装标识、速率限制、设备信号和总预算熔断。额度服务故障时不影响 BYOK。

### 开源复制

真正开源不能阻止合法分叉。通过 MPL、BSL、商标、官方内容版权、认证和商店信任提高全盘复制后冒充或闭源经营的成本。

### 移动平台限制

iOS 不支持个人微信/QQ Bridge。Android 后台、通知和无障碍能力因厂商不同而变化，必须以真实设备和风险分级为准。

### 长期关系伦理

陪伴时长不能演变为依赖和操纵机制。Viraha 宪章、安全审计、记忆解释和用户控制属于产品功能，不是文档附录。

## 18. 对现有计划的影响

已完成的 Node 22、稳定路径、Doctor 和产品 CLI 工作继续保留，作为 Studio 与 Node Runtime 的发布基础。

原 Arete Studio Foundation Plan 的后续 React Web、Web 会话迁移和桌面发布工作暂停。它们不被删除，但不再是当前产品主线。下一份实施计划从 Portable Companion Core 和 Android Mobile 骨架开始。
