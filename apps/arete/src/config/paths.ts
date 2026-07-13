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
    const localAppData = env.LOCALAPPDATA?.trim()
    const dataHome = localAppData && pathApi.isAbsolute(localAppData) ? localAppData : homeDir
    rootDir = pathApi.join(dataHome, "Viraha", "Arete")
  } else if (platform === "darwin") {
    rootDir = pathApi.join(homeDir, "Library", "Application Support", "Viraha", "Arete")
  } else {
    const xdgDataHome = env.XDG_DATA_HOME?.trim()
    const dataHome = xdgDataHome && pathApi.isAbsolute(xdgDataHome)
      ? xdgDataHome
      : pathApi.join(homeDir, ".local", "share")
    rootDir = pathApi.join(dataHome, "viraha", "arete")
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
