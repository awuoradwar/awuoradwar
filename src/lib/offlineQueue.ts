"use client";

// Lightweight offline outbox for quick-add writes. Spec 32: show an
// explicit Queued/Not Yet Synced state, auto-sync on reconnect, and use
// client-generated idempotency keys so a retry can never create two server
// records (the server side of that guarantee is `withIdempotency` in
// src/lib/audit.ts -- every action kind below passes its idempotencyKey
// through to a service create call that checks it before inserting).

export type QueueKind =
  | "task"
  | "callIn"
  | "late"
  | "guestRecovery"
  | "borrowedItem"
  | "issue";

export interface QueuedItem {
  id: string; // idempotency key, also the queue entry id
  kind: QueueKind;
  label: string;
  fields: Record<string, string>;
  createdAt: string;
}

const STORAGE_KEY = "shiftops_offline_queue_v1";

function read(): QueuedItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function write(items: QueuedItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("shiftops-queue-changed"));
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function isOnline(): boolean {
  // Node 21+ exposes a minimal global `navigator` without `onLine`, so
  // guard for that in addition to the plain "no navigator at all" SSR case.
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") return true;
  return navigator.onLine;
}

export function enqueue(item: QueuedItem) {
  write([...read(), item]);
}

export function dequeue(id: string) {
  write(read().filter((i) => i.id !== id));
}

export function getQueue(): QueuedItem[] {
  return read();
}
