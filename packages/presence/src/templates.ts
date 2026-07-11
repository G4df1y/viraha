export function getProactiveMessage(type: string, data: Record<string, unknown>): string {
  const templates: Record<string, () => string> = {
    no_training_never() {
      const messages = [
        "嘿，我注意到你还没记录过训练。准备好开始了吗？15 分钟也算数。",
        "我们还没一起练过呢！这周目标是什么？从小处开始，现在就开始。",
        "最难的是开始——而你已经开始 了，既然你在这儿。让我们规划第一次训练吧！",
      ]
      return messages[Math.floor(Math.random() * messages.length)]
    },

    no_training_3_days() {
      const messages = [
        "距上次训练已经 3 天了。坚持比强度重要——轻量练练也算。",
        "3 天是个危险区。今天练一次就能保持节奏。你能行的！",
        "快速 check-in：身体感觉怎么样？散个步或轻量练练都能保住习惯。",
      ]
      return messages[Math.floor(Math.random() * messages.length)]
    },

    no_training_5_days() {
      const messages = [
        "嘿，已经 5 天了。我不是来让你愧疚的，是来帮你回到正轨的。什么在挡路？",
        "5 天休息是个重置信号。我们聊聊发生了什么，计划一下回归。明早怎么样？",
        "间隔越来越大了。别让完美成为完成的敌人。今天 20 分钟，没借口。",
      ]
      return messages[Math.floor(Math.random() * messages.length)]
    },

    streak_milestone() {
      const streak = data.streak as number
      const messages: Record<number, string[]> = {
        3: ["连续 3 次了！习惯就是这么 built 的。继续！", "三连！坚持正在变成你的身份。"],
        5: ["5 次了！你已经过了新手坎。Respect。", "连续 5 次——你不再是新手了。"],
        7: ["整整一周！蜕变就是这样发生的。", "7 天。你 build 了一个习惯。为你骄傲。"],
        14: ["连续 14 天！这是纪律，不是动机。Legendary。", "两周坚持。到这个点，这就是你了。"],
        21: ["21 天。都说养成习惯要这么久。你做到了。", "三周的 showing up。你和第 1 天不是一个人了。"],
        30: ["30 天！整整一个月。你值得庆祝。", "一个月的坚持。大多数人到不了这里。你到了。"],
      }
      const pool = messages[streak] ?? ["保持连胜！"]
      return pool[Math.floor(Math.random() * pool.length)]
    },

    level_up() {
      const level = data.level as number
      return `等级提升！你到 Lv.${level} 了。你的投入正在 build something real。`
    },

    week_start() {
      const messages = [
        "新一周，新机会。这周训练目标是什么？",
        "周一到了。这周安排 3 次训练，然后干掉它们。",
        "本周任务：show up 3 次。不管多重，出现就行。",
      ]
      return messages[Math.floor(Math.random() * messages.length)]
    },

    meal_check() {
      const hour = new Date().getHours()
      if (hour < 10) {
        return "早上好！早餐吃了什么？一天的燃料从这里开始。"
      }
      if (hour < 14) {
        return "午餐安排了吗？蛋白质够不够？"
      }
      if (hour < 18) {
        return "下午茶时间——饿不饿？别让血糖掉了。"
      }
      return "晚餐打算吃什么？练后补充蛋白质了吗？"
    },
  }

  const generator = templates[type]
  if (!generator) return ""
  return generator()
}
