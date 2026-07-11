import { open as defaultOpenFile } from "node:fs/promises"

import { resolveAretePaths } from "../config/paths.js"

const READ_CHUNK_SIZE = 64 * 1024

interface TailFile {
  stat(): Promise<{ size: number }>
  read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number }>
  close(): Promise<void>
}

export interface ReadLogTailOptions {
  logPath?: string
  openFile?: (path: string, flags: "r") => Promise<TailFile>
}

export async function readLogTail(
  lines = 200,
  options: ReadLogTailOptions = {},
): Promise<string> {
  if (!Number.isFinite(lines) || !Number.isInteger(lines) || lines <= 0) return ""

  const logPath = options.logPath ?? resolveAretePaths().logPath
  const openFile = options.openFile ?? defaultOpenFile

  try {
    const file = await openFile(logPath, "r")
    try {
      const { size } = await file.stat()
      let position = size
      let newlineCount = 0
      const chunks: Buffer[] = []

      while (position > 0 && newlineCount < lines + 1) {
        const length = Math.min(READ_CHUNK_SIZE, position)
        position -= length
        const buffer = Buffer.allocUnsafe(length)
        const { bytesRead } = await file.read(buffer, 0, length, position)
        const chunk = buffer.subarray(0, bytesRead)
        chunks.unshift(chunk)
        newlineCount += countLineFeeds(chunk)
      }

      const entries = Buffer.concat(chunks).toString("utf8").split(/\r\n|\n|\r/)
      if (entries.at(-1) === "") entries.pop()
      return entries.slice(-lines).join("\n")
    } finally {
      await file.close()
    }
  } catch (error) {
    if (isMissingFile(error)) return `No log file yet: ${logPath}`
    throw error
  }
}

function countLineFeeds(buffer: Buffer): number {
  let count = 0
  for (const byte of buffer) {
    if (byte === 0x0a) count += 1
  }
  return count
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
