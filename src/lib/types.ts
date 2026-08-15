export type Position =
  | "GM"
  | "ASSISTANT_MANAGER"
  | "CHEF"
  | "VISITING_MANAGER"
  | "ASSOCIATE";

export type Language = "en" | "es";

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  position: Position;
  language: Language;
  active: number;
  created_at: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  position: Position;
  language: Language;
  storeId: string;
}

export const MANAGER_POSITIONS: Position[] = [
  "GM",
  "ASSISTANT_MANAGER",
  "CHEF",
  "VISITING_MANAGER",
];

export function isManagerPosition(p: Position): boolean {
  return MANAGER_POSITIONS.includes(p);
}

export type TaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "COMPLETE"
  | "CARRIED_FORWARD"
  | "CANCELLED";

export type TaskPriority = "NOW" | "THIS_SHIFT" | "TODAY" | "THIS_WEEK";

export type Effort = "QUICK" | "STANDARD" | "MAJOR";

export type ScheduledFor =
  | "TODAY"
  | "NEXT_SHIFT"
  | "TOMORROW"
  | "LATER_THIS_WEEK"
  | "DATE";
