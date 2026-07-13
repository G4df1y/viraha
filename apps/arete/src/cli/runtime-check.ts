export type NodeVersionCheck =
  | { ok: true; major: number }
  | { ok: false; major: number; message: string }

export function checkNodeVersion(version = process.versions.node): NodeVersionCheck {
  const major = Number.parseInt(version.split(".")[0], 10)

  if (major === 22) {
    return { ok: true, major }
  }

  return {
    ok: false,
    major,
    message: `Arete requires Node.js 22 LTS. Detected ${version}.`,
  }
}
