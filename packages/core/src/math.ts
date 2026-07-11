type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "^" }
  | { type: "paren"; value: "(" | ")" }

const PRECEDENCE: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "^": 3,
}

const RIGHT_ASSOCIATIVE = new Set(["^"])

export function evaluateMathExpression(expression: string): number {
  const tokens = tokenize(expression)
  const output = toReversePolish(tokens)
  return evaluateReversePolish(output)
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let expectValue = true

  while (i < expression.length) {
    const char = expression[i]

    if (/\s/.test(char)) {
      i++
      continue
    }

    const next = expression[i + 1]
    const signedNumber = (char === "-" || char === "+") && expectValue && (isDigit(next) || next === ".")
    if (isDigit(char) || char === "." || signedNumber) {
      let raw = char
      i++
      while (i < expression.length && (isDigit(expression[i]) || expression[i] === ".")) {
        raw += expression[i]
        i++
      }
      const value = Number(raw)
      if (!Number.isFinite(value)) throw new Error("Invalid number")
      tokens.push({ type: "number", value })
      expectValue = false
      continue
    }

    if ("+-*/^".includes(char)) {
      if (expectValue) throw new Error("Unexpected operator")
      tokens.push({ type: "operator", value: char as "+" | "-" | "*" | "/" | "^" })
      expectValue = true
      i++
      continue
    }

    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char })
      expectValue = char === "("
      i++
      continue
    }

    throw new Error("Unsupported character")
  }

  if (!tokens.length) throw new Error("Expression is empty")
  return tokens
}

function toReversePolish(tokens: Token[]): Token[] {
  const output: Token[] = []
  const operators: Token[] = []

  for (const token of tokens) {
    if (token.type === "number") {
      output.push(token)
      continue
    }

    if (token.type === "operator") {
      while (operators.length) {
        const top = operators[operators.length - 1]
        if (top.type !== "operator") break

        const shouldPop = RIGHT_ASSOCIATIVE.has(token.value)
          ? PRECEDENCE[token.value] < PRECEDENCE[top.value]
          : PRECEDENCE[token.value] <= PRECEDENCE[top.value]

        if (!shouldPop) break
        output.push(operators.pop()!)
      }
      operators.push(token)
      continue
    }

    if (token.value === "(") {
      operators.push(token)
      continue
    }

    let matched = false
    while (operators.length) {
      const top = operators.pop()!
      if (top.type === "paren" && top.value === "(") {
        matched = true
        break
      }
      output.push(top)
    }
    if (!matched) throw new Error("Mismatched parentheses")
  }

  while (operators.length) {
    const top = operators.pop()!
    if (top.type === "paren") throw new Error("Mismatched parentheses")
    output.push(top)
  }

  return output
}

function evaluateReversePolish(tokens: Token[]): number {
  const stack: number[] = []

  for (const token of tokens) {
    if (token.type === "number") {
      stack.push(token.value)
      continue
    }

    if (token.type !== "operator") throw new Error("Invalid expression")
    const right = stack.pop()
    const left = stack.pop()
    if (left === undefined || right === undefined) throw new Error("Invalid expression")

    switch (token.value) {
      case "+": stack.push(left + right); break
      case "-": stack.push(left - right); break
      case "*": stack.push(left * right); break
      case "/":
        if (right === 0) throw new Error("Division by zero")
        stack.push(left / right)
        break
      case "^": stack.push(left ** right); break
    }
  }

  if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new Error("Invalid expression")
  return stack[0]
}

function isDigit(value: string | undefined): boolean {
  return value !== undefined && value >= "0" && value <= "9"
}
