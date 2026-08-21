import type { TrainingPosition } from "./services/trainingService";
import type { Language } from "./types";

export const TRAINING_POSITION_LABEL: Record<TrainingPosition, Record<Language, string>> = {
  COUNTERHELP: { en: "Counterhelp (FOH)", es: "Mostrador (FOH)" },
  SHIFT_LEAD: { en: "Shift Lead (FOH)", es: "Líder de Turno (FOH)" },
  COOK: { en: "Cook (BOH)", es: "Cocinero (BOH)" },
  KITCHENHELP: { en: "Kitchenhelp (BOH)", es: "Ayudante de Cocina (BOH)" },
};

export const TRAINING_POSITIONS: TrainingPosition[] = ["COUNTERHELP", "SHIFT_LEAD", "COOK", "KITCHENHELP"];
