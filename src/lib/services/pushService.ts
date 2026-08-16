import "server-only";
import webpush from "web-push";
import { getDb } from "../db";
import { newId, nowIso } from "../audit";

// Dev-safe default keypair, same pattern as SESSION_SECRET in auth.ts --
// override with real env vars in production. Regenerate via
// `npx web-push generate-vapid-keys` for a real deployment.
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BEt0gm2N8oLs0pDgHDigzlguNVlFaQoP-Cs2Oidls0EVQcnN-HYi1TUQHX9Y8MnelRmCM3GP0_5TROmYSk9_axU";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "B8AixgJt1hvxjjxgxfh78oLVmWT_6oD5X1iTRgejiJ4";

webpush.setVapidDetails("mailto:support@shiftops.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function saveSubscription(userId: string, sub: PushSubscriptionInput) {
  const db = getDb();
  db.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
  ).run(newId(), userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, nowIso());
}

export function removeSubscription(endpoint: string) {
  const db = getDb();
  db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
}

export function hasSubscription(userId: string): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT 1 FROM push_subscriptions WHERE user_id = ? LIMIT 1`).get(userId);
  return !!row;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

function subscriptionsForUser(userId: string) {
  const db = getDb();
  return db.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`).all(userId) as Array<{
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
}

async function deliver(subs: Array<{ endpoint: string; p256dh: string; auth: string }>, payload: PushPayload) {
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) removeSubscription(sub.endpoint);
      }
    })
  );
}

/** Push to every device a specific user has subscribed on. */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  await deliver(subscriptionsForUser(userId), payload);
}

/** Push to every manager currently subscribed at a store, optionally skipping one (e.g. the actor who just created the alert). */
export async function sendPushToStore(storeId: string, payload: PushPayload, excludeUserId?: string) {
  const db = getDb();
  const subs = db
    .prepare(
      `SELECT ps.endpoint, ps.p256dh, ps.auth FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       JOIN store_memberships m ON m.user_id = u.id AND m.store_id = ? AND m.active = 1
       WHERE ps.user_id != ?`
    )
    .all(storeId, excludeUserId || "") as Array<{ endpoint: string; p256dh: string; auth: string }>;
  await deliver(subs, payload);
}
