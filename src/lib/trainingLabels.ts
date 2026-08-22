import type { TrainingPosition, TrainingItemPhase } from "./services/trainingService";
import type { Language } from "./types";

export const TRAINING_POSITION_LABEL: Record<TrainingPosition, Record<Language, string>> = {
  COUNTERHELP: { en: "Counterhelp (FOH)", es: "Mostrador (FOH)" },
  SHIFT_LEAD: { en: "Shift Lead (FOH)", es: "Líder de Turno (FOH)" },
  COOK: { en: "Cook (BOH)", es: "Cocinero (BOH)" },
  KITCHENHELP: { en: "Kitchenhelp (BOH)", es: "Ayudante de Cocina (BOH)" },
};

export const TRAINING_POSITIONS: TrainingPosition[] = ["COUNTERHELP", "SHIFT_LEAD", "COOK", "KITCHENHELP"];

export const TRAINING_PHASE_LABEL: Record<TrainingItemPhase, Record<Language, string>> = {
  OPENING: { en: "Opening Procedures", es: "Procedimientos de Apertura" },
  SHIFT: { en: "Shift Procedures", es: "Procedimientos de Turno" },
  CLOSING: { en: "Closing Procedures", es: "Procedimientos de Cierre" },
};

export const TRAINING_PHASES: TrainingItemPhase[] = ["OPENING", "SHIFT", "CLOSING"];
