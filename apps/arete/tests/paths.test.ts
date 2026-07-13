import path from "node:path"

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

  it.each(["   ", "AppData\\Local"])(
    "falls back to the Windows home directory for invalid LOCALAPPDATA %j",
    localAppData => {
      const paths = resolveAretePaths({
        platform: "win32",
        homeDir: "C:\\Users\\Ada",
        env: { LOCALAPPDATA: localAppData },
      })

      expect(paths.rootDir).toBe("C:\\Users\\Ada\\Viraha\\Arete")
    },
  )

  it("prefers ARETE_HOME over the platform default", () => {
    const paths = resolveAretePaths({
      platform: "linux",
      homeDir: "/home/ada",
      env: { ARETE_HOME: "/srv/arete" },
    })

    expect(paths.rootDir).toBe("/srv/arete")
    expect(paths.dataDir).toBe("/srv/arete/data")
  })

  it("trims and resolves a relative ARETE_HOME with the simulated platform", () => {
    const paths = resolveAretePaths({
      platform: "linux",
      homeDir: "/home/ada",
      env: { ARETE_HOME: "  relative/arete  " },
    })

    expect(paths.rootDir).toBe(path.posix.resolve("relative/arete"))
    expect(path.posix.isAbsolute(paths.rootDir)).toBe(true)
  })

  it("ignores a whitespace-only ARETE_HOME", () => {
    const paths = resolveAretePaths({
      platform: "linux",
      homeDir: "/home/ada",
      env: { ARETE_HOME: "   " },
    })

    expect(paths.rootDir).toBe("/home/ada/.local/share/viraha/arete")
  })

  it("uses XDG_DATA_HOME for the Linux application root", () => {
    const paths = resolveAretePaths({
      platform: "linux",
      homeDir: "/home/ada",
      env: { XDG_DATA_HOME: "/var/lib/ada" },
    })

    expect(paths.rootDir).toBe("/var/lib/ada/viraha/arete")
  })

  it.each(["   ", "var/lib/ada"])(
    "falls back to the Linux home directory for invalid XDG_DATA_HOME %j",
    xdgDataHome => {
      const paths = resolveAretePaths({
        platform: "linux",
        homeDir: "/home/ada",
        env: { XDG_DATA_HOME: xdgDataHome },
      })

      expect(paths.rootDir).toBe("/home/ada/.local/share/viraha/arete")
    },
  )
})
