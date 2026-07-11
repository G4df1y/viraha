import { describe, expect, it } from "vitest"

import { resolveAretePaths } from "../src/config/paths.js"

describe("resolveAretePaths", () => {
  it("uses LOCALAPPDATA for the Windows application root", () => {
    const paths = resolveAretePaths({
      platform: "win32",
      homeDir: "C:\\Users\\Ada",
      env: { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" },
    })

    expect(paths.rootDir).toBe("C:\\Users\\Ada\\AppData\\Local\\Viraha\\Arete")
    expect(paths.dbPath).toBe("C:\\Users\\Ada\\AppData\\Local\\Viraha\\Arete\\data\\arete.db")
  })

  it("prefers ARETE_HOME over the platform default", () => {
    const paths = resolveAretePaths({
      platform: "linux",
      homeDir: "/home/ada",
      env: { ARETE_HOME: "/srv/arete" },
    })

    expect(paths.rootDir).toBe("/srv/arete")
    expect(paths.dataDir).toBe("/srv/arete/data")
  })

  it("uses XDG_DATA_HOME for the Linux application root", () => {
    const paths = resolveAretePaths({
      platform: "linux",
      homeDir: "/home/ada",
      env: { XDG_DATA_HOME: "/var/lib/ada" },
    })

    expect(paths.rootDir).toBe("/var/lib/ada/viraha/arete")
  })
})
