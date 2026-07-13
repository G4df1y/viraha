import type { DoctorCheck } from "./doctor.js"

export const USAGE = `Usage:
  arete start
  arete doctor
  arete logs`

export function formatDoctorCheck(check: DoctorCheck): string {
  const status = check.ok ? "OK" : "FAIL"
  return `${status} ${check.id}: ${check.message ?? "Ready"}`
}
