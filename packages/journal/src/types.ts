/** 日记条目 */
export interface JournalEntry {
  id: string
  userId: string
  /** YYYY-MM-DD */
  date: string
  content: string
  /** 情绪标签（逗号分隔，可空） */
  moodTags?: string
  /** 谁写的：user / arete */
  generatedBy: "user" | "arete"
  createdAt: string
}

/** Arete 共写日记时的生成请求 */
export interface AreteJournalRequest {
  userId: string
  date: string
  /** 用户当天已有的日记内容（Arete 据此生成回应/补充） */
  userEntry?: string
  /** 用户当天情绪状态摘要 */
  moodSummary?: string
}
