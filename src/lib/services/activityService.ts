import "server-only";
import { getDb } from "../db";

export interface ActivityItem {
  id: string;
  entity_type: string;
  action: string;
  created_at: string;
  actor_name: string | null;
  title: string;
}

/**
 * A live, read-only feed of what's actually happened across the store --
 * no generate/acknowledge ceremony, just "what's everyone been doing."
 * Distinct from the formal Handoff snapshot: this is always current, never
 * has to be explicitly created, and anyone can check it anytime. Joins each
 * entity's own table (rather than querying audit_events alone) both to get
 * a real title per event and to scope correctly to this store -- audit_events
 * itself has no store_id column. Excludes task-creation events with no
 * actor: those are the recurring engine auto-generating today's instances
 * (recurrenceService writes actor: null), not something a person did --
 * pure scheduling housekeeping that would otherwise flood this feed with
 * dozens of "System logged X" rows every single day.
 */
export function getRecentActivity(storeId: string, sinceIso: string, limit = 50): ActivityItem[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ae.id as id, 'task' as entity_type, ae.action as action, ae.created_at as created_at, u.name as actor_name, t.title as title
       FROM audit_events ae
       JOIN tasks t ON t.id = ae.entity_id
       LEFT JOIN users u ON u.id = ae.actor_id
       WHERE ae.entity_type = 'task' AND t.store_id = ? AND ae.created_at > ? AND ae.actor_id IS NOT NULL

       UNION ALL

       SELECT ae.id, 'cleaning_task', ae.action, ae.created_at, u.name, ct.title
       FROM audit_events ae
       JOIN cleaning_tasks ct ON ct.id = ae.entity_id
       JOIN cleaning_areas a ON a.id = ct.area_id
       LEFT JOIN users u ON u.id = ae.actor_id
       WHERE ae.entity_type = 'cleaning_task' AND a.store_id = ? AND ae.created_at > ?

       UNION ALL

       SELECT ae.id, 'guest_recovery', ae.action, ae.created_at, u.name, gr.issue_category
       FROM audit_events ae
       JOIN guest_recoveries gr ON gr.id = ae.entity_id
       LEFT JOIN users u ON u.id = ae.actor_id
       WHERE ae.entity_type = 'guest_recovery' AND gr.store_id = ? AND ae.created_at > ?

       UNION ALL

       SELECT ae.id, 'issue', ae.action, ae.created_at, u.name, i.description
       FROM audit_events ae
       JOIN issues i ON i.id = ae.entity_id
       LEFT JOIN users u ON u.id = ae.actor_id
       WHERE ae.entity_type = 'issue' AND i.store_id = ? AND ae.created_at > ?

       UNION ALL

       SELECT ae.id, 'borrowed_item', ae.action, ae.created_at, u.name, bi.item
       FROM audit_events ae
       JOIN borrowed_items bi ON bi.id = ae.entity_id
       LEFT JOIN users u ON u.id = ae.actor_id
       WHERE ae.entity_type = 'borrowed_item' AND bi.store_id = ? AND ae.created_at > ?

       UNION ALL

       SELECT ae.id, 'catering_order', ae.action, ae.created_at, u.name,
         'Catering: ' || coalesce(co.customer_name || ' · ', '') || coalesce(co.number_of_people, '?') || ' people'
       FROM audit_events ae
       JOIN catering_orders co ON co.id = ae.entity_id
       LEFT JOIN users u ON u.id = ae.actor_id
       WHERE ae.entity_type = 'catering_order' AND co.store_id = ? AND ae.created_at > ?

       ORDER BY created_at DESC LIMIT ?`
    )
    .all(storeId, sinceIso, storeId, sinceIso, storeId, sinceIso, storeId, sinceIso, storeId, sinceIso, storeId, sinceIso, limit) as ActivityItem[];
}
