import { describe, expect, it } from "vitest"
import os from "os"
import path from "path"
import fs from "fs"
import { loadLocalCompanionPack } from "../src/plugin-loader.js"

describe("plugin loader", () => {
  it("loads a local companion pack manifest", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "viraha-pack-"))
    fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify({
      name: "demo-pack",
      version: "1.0.0",
      description: "Demo pack",
      tools: [{
        name: "demo_tool",
        description: "Demo tool",
        inputSchema: { type: "object", properties: {} },
      }],
    }))

    const pack = await loadLocalCompanionPack(dir)

    expect(pack.name).toBe("demo-pack")
    expect(pack.tools?.map(t => t.name)).toEqual(["demo_tool"])
  })
})
