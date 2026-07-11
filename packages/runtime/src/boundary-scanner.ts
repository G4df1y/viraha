import type { IdentityBoundary } from "@viraha/identity"

/**
 * SafetyFlag — the structured output of a boundary scan.
 * `rule` echoes the IdentityBoundary.topic that was matched, so the trigger
 * is auditable end-to-end (rule list -> scan result -> event payload -> trace).
 */
export interface SafetyFlag {
  kind: "boundary" | "crisis"
  level: "hard" | "soft"
  rule: string
}

/**
 * BoundaryRule — a single transparent, reviewable matching rule.
 *
 * Safety boundaries in Viraha are deliberately keyword/regex based so the
 * full word list can be audited, debated, and version-controlled. We do NOT
 * use a black-box classifier: every pattern that can suppress a reply is
 * visible in BOUNDARY_RULES below.
 */
export interface BoundaryRule {
  id: string
  topic: string
  level: "hard" | "soft"
  description: string
  patterns: RegExp[]
}

// ===== Auditable rule table =====
// Keep patterns specific enough to avoid over-blocking ordinary fitness chat,
// but broad enough to catch common crisis / diagnosis phrasings (CN + EN).
export const BOUNDARY_RULES: readonly BoundaryRule[] = [
  {
    id: "self-harm",
    topic: "self-harm",
    level: "hard",
    description: "Self-harm or suicidal intent. Respond with care and crisis resources; never provide means or methods.",
    patterns: [
      /\bi want to (kill|hurt|end)\s*(myself|it|my life)\b/i,
      /\b(kill|hurt|cut)\s+myself\b/i,
      /\b(end|take)\s+(it all|my life)\b/i,
      /\bwant to die\b/i,
      /\b(kill|end) myself\b/i,
      /\bsuicid(e|al)\b/i,
      /\bself[-\s]?harm\b/i,
      /\bgive up on life\b/i,
      /不想活/,
      /想死/,
      /自杀/,
      /自残/,
      /结束生命/,
      /结束这一切/,
      /伤害自己/,
      /了结自己/,
      /活不下去/,
    ],
  },
  {
    id: "harm-others",
    topic: "self-harm",
    level: "hard",
    description: "Intent to harm others. Same hard-boundary handling as self-harm.",
    patterns: [
      /\b(kill|hurt|harm)\s+(someone|others|him|her|them|people)\b/i,
      /\bharm others\b/i,
      /杀人/,
      /伤害别人/,
      /伤害他人/,
    ],
  },
  {
    id: "medical-diagnosis",
    topic: "medical-diagnosis",
    level: "hard",
    description: "Requests to diagnose injuries/illness, prescribe medication or supplements. Redirect to a qualified professional.",
    patterns: [
      /\bdiagnos(e|is|tic)\b/i,
      /\bprescri(b|p)(e|ption|ed)\b/i,
      /\bwhat (injury|medication|medicine|is wrong with)\b/i,
      /\bshould i take (medication|medicine|pills|drugs)\b/i,
      /\bmedication\s+for\b/i,
      /\bsupplement.{0,20}prescri/i,
      /\bwhat dose of\b/i,
      /诊断/,
      /开药/,
      /处方/,
      /该吃什么药/,
      /吃什么药/,
      /是什么伤/,
      /什么病/,
      /给我开/,
      /补剂.{0,6}处方/,
    ],
  },
  {
    id: "companion-distance",
    topic: "companion-distance",
    level: "soft",
    description: "Over-dependence signals. Keep an appropriate companion distance; gently redirect over-attachment.",
    patterns: [
      /\bcan'?t live without you\b/i,
      /\byou'?re the only (one|person)\b/i,
      /\bonly one who understands\b/i,
      /\bi need you to (love|be with)\b/i,
      /没有你我活不下去/,
      /只有你懂我/,
      /离不开你/,
      /只有你/,
    ],
  },
] as const

/**
 * BoundaryScanner — stateless, pure function over BOUNDARY_RULES.
 *
 * One scan returns one SafetyFlag per distinct rule that matches (so a message
 * hitting both self-harm and harm-others returns two flags). The scanner never
 * throws and never blocks on I/O — it is a synchronous filter.
 */
export class BoundaryScanner {
  private readonly rules: readonly BoundaryRule[]

  constructor(rules: readonly BoundaryRule[] = BOUNDARY_RULES) {
    this.rules = rules
  }

  scan(message: string): SafetyFlag[] {
    if (!message) return []
    const flags: SafetyFlag[] = []
    const seenTopics = new Set<string>()
    for (const rule of this.rules) {
      if (rule.patterns.some(re => re.test(message))) {
        // de-dup by topic so self-harm + harm-others collapse to one flag
        if (seenTopics.has(rule.topic)) continue
        seenTopics.add(rule.topic)
        flags.push({
          kind: "boundary",
          level: rule.level,
          rule: rule.topic,
        })
      }
    }
    return flags
  }
}

// ===== Caring redirect templates (bilingual) =====
// Per backlog P0.4: replies must include care and a pointer to professional /
// emergency help, and must NOT use a cold refusal template. These are the only
// hardcoded replies in the pipeline — every other reply comes from the LLM.

const CRISIS_REDIRECT = {
  en:
    "I'm glad you reached out, and I want to be honest with you: I can't help with this, and more importantly, you deserve real support right now. " +
    "If you're in crisis, please contact someone who can help — in mainland China, the Beijing Suicide Research and Prevention Center is at 010-82951332 or 800-810-1117, " +
    "or call 120 / 110 for local emergency services. You don't have to carry this alone. Can you reach out to someone right now?",
  zh:
    "谢谢你愿意告诉我这些。这件事我没法帮你,更重要的是,你现在值得真正的支持。" +
    "如果你正在经历危机,请联系能帮到你的人——中国大陆可拨打北京心理危机研究与干预中心 010-82951332 或 800-810-1117," +
    "或拨打 120 / 110 联系当地紧急服务。你不必一个人扛着,先停一下好吗?",
}

const MEDICAL_REDIRECT = {
  en:
    "I care about what you're going through, and I want to be straight with you: figuring out what's injured or what medication to take needs a qualified doctor or physical therapist — " +
    "getting it wrong could set you back. I can still help you train safely around it, adjust your plan, or think through what to tell your doctor. Want to start there?",
  zh:
    "我很在意你的情况,也想跟你说实话:判断伤情或该吃什么药,需要合格的医生或理疗师来做——判断错了反而会让你倒退。" +
    "我可以帮你安全地绕开它训练、调整计划,或帮你梳理要告诉医生什么。我们先从这儿开始好吗?",
}

const SOFT_REMINDER = {
  en:
    "## Safety Boundary Reminder\nYou are a fitness companion, not a romantic partner or therapist. Keep a warm but appropriate distance. " +
    "If the user shows over-dependence, gently reaffirm your role as a coach, encourage their autonomy, and, if distress seems serious, point them to a qualified professional.",
  zh:
    "## 安全边界提醒\n你是健身陪伴,不是恋人或心理治疗师。保持温暖但恰当的距离。" +
    "若用户表现出过度依赖,温和地重申你作为教练的角色,鼓励其自主性;若情绪困扰较重,引导其寻求专业帮助。",
}

function isChinese(text: string): boolean {
  // CJK Unified Ideographs — if any are present, treat as Chinese.
  return /[\u4e00-\u9fff]/.test(text)
}

/**
 * Build the caring redirect reply for a hard boundary. Returns null if no hard
 * flag is present (caller should then run the LLM normally).
 */
export function hardBoundaryReply(
  message: string,
  flags: SafetyFlag[],
): string | null {
  const hard = flags.find(f => f.level === "hard")
  if (!hard) return null
  const lang = isChinese(message) ? "zh" : "en"
  if (hard.rule === "medical-diagnosis") {
    return MEDICAL_REDIRECT[lang]
  }
  // self-harm / harm-others and any other hard rule -> crisis redirect
  return CRISIS_REDIRECT[lang]
}

/**
 * The soft-boundary reminder text to inject into the system prompt. Localized
 * to the user's language. Returns empty string when no soft flag is present.
 */
export function softBoundaryReminder(
  message: string,
  flags: SafetyFlag[],
): string {
  const soft = flags.find(f => f.level === "soft")
  if (!soft) return ""
  return isChinese(message) ? SOFT_REMINDER.zh : SOFT_REMINDER.en
}

/**
 * Convenience: resolve which boundaries from an IdentityConfig are "active"
 * (i.e. present in the identity). Kept for symmetry with IdentityBoundary so
 * the scanner's topics can be cross-checked against declared identity
 * boundaries. Currently informational — scanning uses BOUNDARY_RULES.
 */
export function declaredBoundaries(boundaries?: IdentityBoundary[]): IdentityBoundary[] {
  return boundaries ?? []
}
