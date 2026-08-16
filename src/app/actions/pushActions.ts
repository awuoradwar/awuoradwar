"use server";

import { requireCurrentUser } from "@/lib/auth";
import * as pushService from "@/lib/services/pushService";

export async function getVapidPublicKeyAction(): Promise<string> {
  return pushService.getVapidPublicKey();
}

export async function subscribeToPushAction(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const user = await requireCurrentUser();
  pushService.saveSubscription(user.id, subscription);
  return { ok: true };
}

export async function unsubscribeFromPushAction(endpoint: string) {
  await requireCurrentUser();
  pushService.removeSubscription(endpoint);
  return { ok: true };
}

export async function hasPushSubscriptionAction(): Promise<boolean> {
  const user = await requireCurrentUser();
  return pushService.hasSubscription(user.id);
}
