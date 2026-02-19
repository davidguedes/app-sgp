export interface Evolution {
  id: string;
  date: Date;
  eva?: number; // Escala EVA (0-10)
  exercises?: ExercisesByEquipment; // Exercícios por aparelho
  notes: string; // Observações da aula
  author: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface EvolutionHttpResponse {
  data: Evolution;
  success: boolean;
}

export interface EvolutionsHttpResponse {
  data: Evolution[];
  success: boolean;
}

export interface ExercisesByEquipment {
  reformer?: string[];
  cadillac?: string[];
  chair?: string[];
  barrel?: string[];
  solo?: string[];
}

export interface EvolutionFormData {
  date?: Date;
  eva?: number;
  exercises?: ExercisesByEquipment;
  notes: string;
}

// Lista de exercícios por aparelho
export const EXERCISES_BY_EQUIPMENT = {
  reformer: [
    'Footwork',
    'Hundred',
    'Coordination',
    'Rowing',
    'Circles',
    'Leg Circles',
    'Short Box',
    'Long Stretch',
    'Down Stretch',
    'Elephant',
    'Knee Stretches',
    'Running',
    'Pelvic Lift',
    'Side Splits'
  ],
  cadillac: [
    'Roll Down Bar',
    'Leg Springs',
    'Arm Springs',
    'Tower',
    'Push Through Bar',
    'Monkey',
    'Breathing',
    'Cat Stretch',
    'Mermaid',
    'Spread Eagle'
  ],
  chair: [
    'Footwork',
    'Pike',
    'Mountain Climb',
    'Side Sit-Ups',
    'Swan',
    'Standing Pumps',
    'Mermaid',
    'Tendon Stretch',
    'Going Up Front'
  ],
  barrel: [
    'Side Stretch',
    'Swan',
    'Back Extension',
    'Mermaid',
    'Cat Stretch',
    'Hip Stretch',
    'Shoulder Bridge'
  ],
  solo: [
    'The Hundred',
    'Roll Up',
    'Roll Over',
    'Single Leg Circle',
    'Rolling Like a Ball',
    'Single Leg Stretch',
    'Double Leg Stretch',
    'Spine Stretch',
    'Open Leg Rocker',
    'Corkscrew',
    'Saw',
    'Swan Dive',
    'Single Leg Kick',
    'Double Leg Kick',
    'Neck Pull',
    'Scissors',
    'Bicycle',
    'Shoulder Bridge',
    'Spine Twist',
    'Jackknife',
    'Side Kick Series',
    'Teaser',
    'Hip Circles',
    'Swimming',
    'Leg Pull Front',
    'Leg Pull Back',
    'Side Bend',
    'Boomerang',
    'Seal',
    'Crab',
    'Rocking',
    'Control Balance',
    'Push Up'
  ]
};