import path from "node:path"
import { fileURLToPath } from "node:url"

import { runDoctor as defaultRunDoctor } from "./cli/doctor.js"
import type { DoctorReport } from "./cli/doctor.js"
import { readLogTail as defaultReadLogTail } from "./cli/logs.js"
import { formatDoctorCheck, USAGE } from "./cli/output.js"
import { startArete as defaultStartArete } from "./cli/start.js"

export interface CliDependencies {
  runDoctor?: () => Promise<DoctorReport>
  readLogTail?: () => Promise<string>
  startArete?: () => Promise<number>
  writeLine?: (line: string) => void
}

export async function runCli(
  args: string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const command = args[0] ?? "start"
  const writeLine = dependencies.writeLine ?? console.log

  switch (command) {
    case "start":
      return (dependencies.startArete ?? defaultStartArete)()
    case "doctor": {
      const report = await (dependencies.runDoctor ?? defaultRunDoctor)()
      for (const check of report.checks) writeLine(formatDoctorCheck(check))
      return report.ok ? 0 : 1
    }
    case "logs":
      writeLine(await (dependencies.readLogTail ?? defaultReadLogTail)())
      return 0
    default:
      writeLine(USAGE)
      return 1
  }
}

const entryPath = process.argv[1]
if (entryPath && path.resolve(entryPath) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).then(
    code => { process.exitCode = code },
    error => {
      console.error(error)
      process.exitCode = 1
    },
  )
}
