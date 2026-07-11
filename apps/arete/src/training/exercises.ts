import fs from "fs"
import path from "path"

export interface Exercise {
  name: string
  muscleGroup: string
  primaryMuscles: string[]
  equipment: string
  difficulty: string
}

let _cache: Exercise[] | null = null

export function getExerciseLibrary(): Exercise[] {
  if (_cache) return _cache

  const jsonPath = path.join(process.cwd(), "..", "..", "knowledge-packs", "fitness-pack", "exercises.json")
  const json = fs.readFileSync(jsonPath, "utf-8")
  _cache = JSON.parse(json) as Exercise[]
  return _cache
}

export function findExercises(opts: {
  muscleGroup?: string
  equipment?: string
  difficulty?: string
  query?: string
}): Exercise[] {
  let exercises = getExerciseLibrary()

  if (opts.muscleGroup) {
    exercises = exercises.filter(e => e.muscleGroup === opts.muscleGroup)
  }
  if (opts.equipment) {
    exercises = exercises.filter(e => e.equipment === opts.equipment)
  }
  if (opts.difficulty) {
    exercises = exercises.filter(e => e.difficulty === opts.difficulty)
  }
  if (opts.query) {
    const q = opts.query.toLowerCase()
    exercises = exercises.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.primaryMuscles.some(m => m.includes(q))
    )
  }

  return exercises
}

export function getMuscleGroups(): string[] {
  const exercises = getExerciseLibrary()
  return [...new Set(exercises.map(e => e.muscleGroup))]
}

export function getExercisesByEquipment(equipment: string): Exercise[] {
  return getExerciseLibrary().filter(e => e.equipment === equipment)
}

