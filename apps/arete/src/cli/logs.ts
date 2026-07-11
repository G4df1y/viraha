import { readFile } from "node:fs/promises"

import { resolveAretePaths } from "../config/paths.js"

export interface ReadLogTailOptions {
  logPath?: string
}

export async function readLogTail(
  lines = 200,
  options: ReadLogTailOptions = {},
): Promise<string> {
  if (!Number.isFinite(lines) || lines <= 0) return ""

  const logPath = options.logPath ?? resolveAretePaths().logPath

  try {
    const contents = await readFile(logPath, "utf8")
    const entries = contents.split(/\r\n|\n|\r/)
    if (entries.at(-1) === "") entries.pop()
    return entries.slice(-Math.floor(lines)).join("\n")
  } catch (error) {
    if (isMissingFile(error)) return `No log file yet: ${logPath}`
    throw error
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
