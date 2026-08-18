import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getDb } from "./db";
import { SessionUser } from "./types";
import { storeToday } from "./storeTime";
import { resolveTodaysPic } from "./services/scheduleService";
import { newId, nowIso, writeAudit } from "./audit";

const COOKIE_NAME = "shiftops_session";
const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "dev-only-secret-change-in-production-0001"
);
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days -- store devices stay signed in to cut down on re-login friction

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

async function signSession(userId: string, storeId: string): Promise<string> {
  return new SignJWT({ userId, storeId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(SECRET);
}

export async function createSession(userId: string, storeId: string) {
  const token = await signSession(userId, storeId);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.userId as string;
    const storeId = payload.storeId as string;
    const db = getDb();
    const user = db
      .prepare(`SELECT id, name, email, position, language, active FROM users WHERE id = ?`)
      .get(userId) as SessionUser & { active: number };
    if (!user || !user.active) return null;
    return { ...user, storeId };
  } catch {
    return null;
  }
}

export async function requireCurrentUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/** The manager currently PIC for the store "today". PIC now comes straight
 * from the Week schedule grid -- whoever's scheduled for the store-local
 * current shift window -- so marking the schedule is the whole action; there
 * is no separate "start my shift" step. Keeps a `shifts` row in sync (rather
 * than being purely a read) because other flows (attendance events, audits)
 * link to a shift by id, not by user, and expect one to already exist. Safe
 * to call on every dashboard load -- it's an idempotent upsert. */
export function getCurrentPicForStore(storeId: string) {
  const db = getDb();
  const today = storeToday(storeId);
  const scheduled = resolveTodaysPic(storeId, today, new Date());

  let shift = db
    .prepare(
      `SELECT s.*, u.name as pic_name FROM shifts s
       LEFT JOIN users u ON u.id = s.pic_user_id
       WHERE s.store_id = ? AND s.date = ? AND s.status != 'CLOSED'
       ORDER BY s.created_at DESC LIMIT 1`
    )
    .get(storeId, today) as { id: string; pic_user_id: string | null; pic_name: string | null; status: string; date: string } | undefined;

  if (scheduled && scheduled.id !== shift?.pic_user_id) {
    if (shift) {
      db.prepare(`UPDATE shifts SET pic_user_id = ? WHERE id = ?`).run(scheduled.id, shift.id);
    } else {
      const id = newId();
      db.prepare(`INSERT INTO shifts (id, store_id, date, pic_user_id, status, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?)`).run(
        id,
        storeId,
        today,
        scheduled.id,
        nowIso()
      );
      writeAudit({ entityType: "shift", entityId: id, actor: null, action: "CREATED", newValue: { pic: scheduled.id, source: "schedule" } });
    }
    shift = db
      .prepare(
        `SELECT s.*, u.name as pic_name FROM shifts s LEFT JOIN users u ON u.id = s.pic_user_id
         WHERE s.store_id = ? AND s.date = ? AND s.status != 'CLOSED' ORDER BY s.created_at DESC LIMIT 1`
      )
      .get(storeId, today) as typeof shift;
  }

  return shift;
}
