import { homedir } from "node:os"
import path from "node:path"

export interface AretePaths {
  rootDir: string
  dataDir: string
  configDir: string
  logDir: string
  dbPath: string
  logPath: string
}

export interface ResolveAretePathsOptions {
  platform?: NodeJS.Platform
  homeDir?: string
  env?: Record<string, string | undefined>
}

export function resolveAretePaths(options: ResolveAretePathsOptions = {}): AretePaths {
  const platform = options.platform ?? process.platform
  const homeDir = options.homeDir ?? homedir()
  const env = options.env ?? process.env
  const pathApi = platform === "win32" ? path.win32 : path.posix
  const areteHome = env.ARETE_HOME?.trim()

  let rootDir: string
  if (areteHome) {
    rootDir = pathApi.resolve(areteHome)
  } else if (platform === "win32") {
    rootDir = pathApi.join(env.LOCALAPPDATA || homeDir, "Viraha", "Arete")
  } else if (platform === "darwin") {
    rootDir = pathApi.join(homeDir, "Library", "Application Support", "Viraha", "Arete")
  } else {
    rootDir = pathApi.join(env.XDG_DATA_HOME || pathApi.join(homeDir, ".local", "share"), "viraha", "arete")
  }

  const dataDir = pathApi.join(rootDir, "data")
  const configDir = pathApi.join(rootDir, "config")
  const logDir = pathApi.join(rootDir, "logs")

  return {
    rootDir,
    dataDir,
    configDir,
    logDir,
    dbPath: pathApi.join(dataDir, "arete.db"),
    logPath: pathApi.join(logDir, "arete.log"),
  }
}
