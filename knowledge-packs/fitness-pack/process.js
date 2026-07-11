const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, 'exercises-full.json');
const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

console.log(`Total exercises in source: ${raw.length}`);

const categoryMap = {
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulders',
  'upper arms': 'arms',
  'lower arms': 'arms',
  'upper legs': 'legs',
  'lower legs': 'legs',
  waist: 'core',
  neck: 'core',
  cardio: 'cardio',
};

const equipmentMap = {
  'body weight': 'bodyweight',
  assisted: 'bodyweight',
  cable: 'cable',
  dumbbell: 'dumbbells',
  barbell: 'barbell',
  kettlebell: 'dumbbells',
  machine: 'machine',
  'medicine ball': 'dumbbells',
  'resistance band': 'bodyweight',
  roller: 'bodyweight',
  rope: 'bodyweight',
  'skierg machine': 'machine',
  'sled machine': 'machine',
  'smith machine': 'machine',
  'stationary bike': 'machine',
  'stepmill machine': 'machine',
  'trap bar': 'barbell',
  'upper body ergometer': 'machine',
  weighted: 'dumbbells',
  'wheel roller': 'bodyweight',
};

function inferDifficulty(name) {
  const lower = name.toLowerCase();
  if (lower.includes('beginner') || lower.includes('assisted')) return 'beginner';
  if (lower.includes('advanced') || lower.includes('olympic')) return 'advanced';
  return 'intermediate';
}

const result = raw.map((item) => {
  const name = item.name || '';
  const category = item.category || '';
  const muscleGroup = categoryMap[category] || category;
  const primaryMuscles = item.target ? [item.target] : [];
  const eq = (item.equipment || '').toLowerCase();
  const equipment = equipmentMap[eq] || eq;
  const difficulty = inferDifficulty(name);
  const instructionsCn = item.instructions && item.instructions.zh ? item.instructions.zh : '';
  return {
    name,
    muscleGroup,
    primaryMuscles,
    equipment,
    difficulty,
    instructions_cn: instructionsCn,
  };
});

fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');
console.log(`Written ${result.length} processed exercises`);
