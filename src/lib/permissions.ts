import { Position, SessionUser, isManagerPosition } from "./types";

// Central permission model. This is the ONLY place role logic should be
// decided. The spec's non-negotiable rule: Assistant Manager and Chef are
// the exact same permission tier. Never branch on `position === 'CHEF'`
// anywhere else in the app -- always call these functions.

// Actions that require GM specifically. Enumerated explicitly per spec 2.
export type GmOnlyAction =
  | "schedule_request.decide"
  | "users.manage"
  | "templates.manage"
  | "store.configure"
  | "import.approve_publish"
  | "store_profile.manage"
  | "manager_shifts.manage"
  | "training_items.manage";

const GM_ONLY: GmOnlyAction[] = [
  "schedule_request.decide",
  "users.manage",
  "templates.manage",
  "store.configure",
  "import.approve_publish",
  "store_profile.manage",
  "manager_shifts.manage",
  "training_items.manage",
];

export function canDo(user: Pick<SessionUser, "position">, action: GmOnlyAction): boolean {
  if (GM_ONLY.includes(action)) return user.position === "GM";
  return isManagerPosition(user.position);
}

export function isManager(user: Pick<SessionUser, "position">): boolean {
  return isManagerPosition(user.position);
}

export function isGM(user: Pick<SessionUser, "position">): boolean {
  return user.position === "GM";
}

export function canBePIC(user: Pick<SessionUser, "position">): boolean {
  // GM, AM, Chef, and Visiting managers may all serve as PIC. Identical rule
  // for AM and Chef, as required.
  return isManagerPosition(user.position);
}

export function requireManager(user: Pick<SessionUser, "position"> | null): asserts user is SessionUser {
  if (!user || !isManager(user)) {
    throw new Error("FORBIDDEN: manager-level authorization required");
  }
}

export function requireGM(user: Pick<SessionUser, "position"> | null): asserts user is SessionUser {
  if (!user || !isGM(user)) {
    throw new Error("FORBIDDEN: GM-only action");
  }
}

export const POSITION_LABEL: Record<Position, { en: string; es: string }> = {
  GM: { en: "General Manager", es: "Gerente General" },
  ASSISTANT_MANAGER: { en: "Assistant Manager", es: "Gerente Asistente" },
  CHEF: { en: "Chef", es: "Chef" },
  VISITING_MANAGER: { en: "Visiting Manager", es: "Gerente Visitante" },
  ASSOCIATE: { en: "Associate", es: "Asociado" },
};
