-- Shift Ops data model (SQLite for local/dev).
-- A near-identical Postgres+RLS version lives in supabase_schema.sql for production deployment.
-- All primary keys are UUID text. All timestamps are ISO-8601 UTC strings set server-side.

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  language_default TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  position TEXT NOT NULL, -- GM | ASSISTANT_MANAGER | CHEF | VISITING_MANAGER | ASSOCIATE
  language TEXT NOT NULL DEFAULT 'en', -- en | es
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS store_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  role TEXT NOT NULL, -- mirrors position at this store
  effective_start TEXT,
  effective_end TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  pic_user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | ACTIVE | HANDED_OFF | CLOSED
  created_at TEXT NOT NULL
);

-- The weekly staffing roster: which manager is working which shift on which
-- day (MORNING ~8/9am-5pm, EVENING 5pm-11:45pm, or DOUBLE spanning both).
-- Separate from `shifts` above, which tracks the single active PIC/handoff
-- record for a given date -- this is forward-looking planning input, one row
-- per manager per day, that the dashboard's MY SHIFT bucketing reads to know
-- which window a given viewer is actually working today.
CREATE TABLE IF NOT EXISTS manager_shifts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  shift_type TEXT NOT NULL, -- MORNING | EVENING | DOUBLE
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_manager_shifts_unique ON manager_shifts(store_id, user_id, date);

-- New associate training: GM-editable checklist per position (Counterhelp/
-- Cook/Kitchenhelp -- Cook and Kitchenhelp are distinct BOH positions), so
-- whichever manager is on shift when a step gets trained can check it off
-- and the next manager picks up exactly where training left off.
CREATE TABLE IF NOT EXISTS training_items (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  position TEXT NOT NULL, -- COUNTERHELP | COOK | KITCHENHELP
  title TEXT NOT NULL,
  title_es TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trainees (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL,
  position TEXT NOT NULL, -- COUNTERHELP | COOK | KITCHENHELP
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS', -- IN_PROGRESS | COMPLETE
  started_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- Planned training sessions: a specific day/shift and the manager who will
-- work with the trainee, so training can be scheduled ahead of time and not
-- just checked off ad hoc whenever someone happens to be free.
CREATE TABLE IF NOT EXISTS training_sessions (
  id TEXT PRIMARY KEY,
  trainee_id TEXT NOT NULL REFERENCES trainees(id),
  date TEXT NOT NULL,
  shift_type TEXT NOT NULL, -- MORNING | EVENING | DOUBLE
  manager_id TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- Supplies/equipment/uniforms/tools ordered extra of -- GM defines the item
-- list, any manager adjusts the actual stock count or flags something as
-- ordered during their shift so the next person knows what's on hand and
-- what's already on the way.
CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL, -- base name, e.g. "T-Shirt" -- variants of the same name group together in the UI
  variant TEXT, -- e.g. a size like "M" or "XL"; NULL for items with no variant
  sort_order INTEGER NOT NULL DEFAULT 0, -- display order within a name group (so sizes list XS..3XL, not alphabetically)
  category TEXT NOT NULL, -- SUPPLIES | UNIFORMS | EQUIPMENT | TOOLS | OTHER
  notes TEXT,
  stock_count INTEGER NOT NULL DEFAULT 0, -- actual count on hand
  par_level INTEGER, -- optional threshold; at/below this, the item is flagged low automatically
  on_order INTEGER NOT NULL DEFAULT 0, -- a reorder has been placed and hasn't arrived yet
  last_ordered_at TEXT,
  last_ordered_qty TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- Recurring replace/service items (water filters, bulbs, HVAC filters...) --
-- each "mark done" resets the due date and leaves a dated trail (via
-- audit_events) of exactly when it was last switched and by whom.
CREATE TABLE IF NOT EXISTS maintenance_items (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL,
  location TEXT, -- e.g. "Fountain machine", "Walk-in cooler"
  interval_days INTEGER NOT NULL,
  notes TEXT,
  last_done_at TEXT,
  last_done_by TEXT REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_completions (
  id TEXT PRIMARY KEY,
  trainee_id TEXT NOT NULL REFERENCES trainees(id),
  training_item_id TEXT NOT NULL REFERENCES training_items(id),
  trained_by TEXT REFERENCES users(id),
  trained_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_training_completions_unique ON training_completions(trainee_id, training_item_id);

CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  title TEXT NOT NULL,
  title_es TEXT, -- Spanish title, shown instead of title for es-language viewers when set
  description TEXT,
  area TEXT,
  category TEXT, -- ROUTINE | DEADLINE | MEETING | INVENTORY | TRUCK | LOOMIS | CLEANING
  recurrence_type TEXT NOT NULL, -- DAILY | WEEKDAYS | WEEKLY | BIWEEKLY | MONTHLY | ONE_TIME | CUSTOM
  recurrence_config TEXT, -- JSON: {weekdays:[1,3], dueTime:'11:00', dependsOnTemplateId, conditional}
  default_owner_position TEXT, -- GM | MANAGER | null
  effort TEXT NOT NULL DEFAULT 'STANDARD', -- QUICK | STANDARD | MAJOR
  verification_required INTEGER NOT NULL DEFAULT 0,
  source TEXT, -- 'spec_default' | 'import' | 'manual'
  active INTEGER NOT NULL DEFAULT 1,
  checklist_role TEXT, -- NULL | OPENING | CLOSING -- feeds the My Shift "Opening Ready"/"Closing Complete" summaries
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  template_id TEXT REFERENCES task_templates(id),
  title TEXT NOT NULL,
  description TEXT,
  area TEXT,
  category TEXT,
  owner_id TEXT REFERENCES users(id),
  support_ids TEXT, -- JSON array of user ids
  due_at TEXT,
  scheduled_for TEXT, -- TODAY | NEXT_SHIFT | TOMORROW | LATER_THIS_WEEK | DATE
  scheduled_date TEXT,
  effort TEXT NOT NULL DEFAULT 'STANDARD',
  priority TEXT NOT NULL DEFAULT 'NORMAL', -- computed: NOW | THIS_SHIFT | TODAY | THIS_WEEK
  severity TEXT NOT NULL DEFAULT 'NORMAL', -- NORMAL | CRITICAL
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | IN_PROGRESS | COMPLETE | CARRIED_FORWARD | CANCELLED
  verification_required INTEGER NOT NULL DEFAULT 0,
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  depends_on_task_id TEXT REFERENCES tasks(id),
  source TEXT,
  checklist_role TEXT, -- NULL | OPENING | CLOSING, copied from the generating template
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  completed_by TEXT REFERENCES users(id),
  completed_at TEXT,
  cancel_reason TEXT,
  last_edited_by TEXT REFERENCES users(id),
  last_edited_at TEXT
);

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  action TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  pic_id TEXT REFERENCES users(id),
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cleaning_areas (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL,
  name_es TEXT, -- Spanish name, shown instead of name for es-language viewers when set
  category TEXT NOT NULL, -- FOH | BOH | FACILITIES
  owner_id TEXT REFERENCES users(id),
  default_owner_position TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cleaning_tasks (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES cleaning_areas(id),
  title TEXT NOT NULL,
  title_es TEXT, -- Spanish title, shown instead of title for es-language viewers when set
  description TEXT, -- full checklist detail, e.g. everything a deep-clean covers
  description_es TEXT,
  frequency TEXT NOT NULL DEFAULT 'DAILY', -- DAILY | WEEKLY
  weekday INTEGER, -- 0=Sun..6=Sat; which day a WEEKLY task is due. NULL = any day this week.
  associate_name TEXT,
  manager_owner_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'ASSIGNED', -- ASSIGNED | COMPLETED | VERIFIED | REOPENED
  photo_required INTEGER NOT NULL DEFAULT 0,
  photo_url TEXT, -- deprecated, superseded by photo_before_url/photo_after_url
  photo_before_url TEXT,
  photo_after_url TEXT,
  completed_by TEXT REFERENCES users(id),
  completed_at TEXT,
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  created_at TEXT NOT NULL
);

-- One cleaning task often covers several distinct things to do (e.g. a
-- "Deep clean cook range" task's checklist is really "hoods, lights,
-- wok rings, drains..." as separate jobs) -- these let different
-- associates be assigned to different sub-items of the same task, not
-- just one associate_name for the whole thing.
CREATE TABLE IF NOT EXISTS cleaning_task_items (
  id TEXT PRIMARY KEY,
  cleaning_task_id TEXT NOT NULL REFERENCES cleaning_tasks(id),
  text TEXT NOT NULL,
  associate_name TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_events (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  shift_id TEXT REFERENCES shifts(id),
  employee_name TEXT NOT NULL,
  type TEXT NOT NULL, -- CALL_IN | LATE | NO_SHOW | LEFT_EARLY | SENT_HOME
  event_date TEXT, -- YYYY-MM-DD store-local, e.g. a call-in logged today for a future date
  scheduled_time TEXT,
  actual_time TEXT,
  minutes_late INTEGER,
  coverage_status TEXT, -- NEEDED | FOUND | NOT_FOUND | NOT_REQUIRED
  covering_person TEXT,
  note TEXT,
  recorded_by TEXT REFERENCES users(id),
  pic_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guest_recoveries (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  contact_channel TEXT NOT NULL, -- PHONE | IN_STORE
  order_channel TEXT NOT NULL, -- ONLINE | IN_STORE | DRIVE_THRU
  issue_category TEXT NOT NULL, -- FOOD_QUALITY | ACCURACY | SERVICE | CLEANLINESS | OTHER
  description TEXT,
  item_description TEXT,
  guest_name TEXT, -- optional, so repeat requests from the same guest can be recognized
  value_estimate REAL,
  replacement_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | COMPLETED | NOT_REQUIRED
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  completed_by TEXT REFERENCES users(id),
  completed_at TEXT,
  follow_up_task_id TEXT REFERENCES tasks(id),
  created_by TEXT REFERENCES users(id),
  pic_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS borrowed_items (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  direction TEXT NOT NULL DEFAULT 'BORROWED', -- BORROWED (from another store) | LENT (to another store)
  borrowed_from TEXT NOT NULL, -- the other store, regardless of direction
  item TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  approved_by_name TEXT, -- who authorized this store's side of the move
  picked_up_by_name TEXT, -- who physically handled the pickup
  picked_up_at TEXT, -- when the pickup happened
  due_at TEXT, -- when this needs to be returned/settled by; drives the critical-when-overdue flag
  settlement_method TEXT, -- RETURN_PRODUCT | CRUNCHTIME_TRANSFER | PENDING_CONFIRMATION
  owner_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | SETTLEMENT_SELECTED | RETURN_PENDING | SETTLED
  completed_by TEXT REFERENCES users(id),
  completed_at TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'NORMAL', -- NORMAL | CRITICAL
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | IN_PROGRESS | WAITING | RESOLVED | REOPENED -- WAITING doubles as "needs follow-up" for work orders
  due_date TEXT, -- YYYY-MM-DD, when this work order needs attention by (nullable -- no specific date)
  owner_id TEXT REFERENCES users(id),
  resolution TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS issue_updates (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id),
  note TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS acknowledgements (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  title TEXT NOT NULL,
  source TEXT,
  required_associates TEXT, -- JSON array of names
  responsible_manager_id TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS acknowledgement_completions (
  id TEXT PRIMARY KEY,
  acknowledgement_id TEXT NOT NULL REFERENCES acknowledgements(id),
  associate_name TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  type TEXT NOT NULL, -- GEM_CALL | AREA_WEEKLY
  weekday INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  conditional INTEGER NOT NULL DEFAULT 0,
  required_state TEXT, -- REQUIRED | NOT_REQUIRED (per week, see meeting_week_state)
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meeting_week_state (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  week_of TEXT NOT NULL,
  required_state TEXT NOT NULL DEFAULT 'REQUIRED',
  set_by TEXT REFERENCES users(id),
  set_at TEXT
);

CREATE TABLE IF NOT EXISTS meeting_actions (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  week_of TEXT,
  task_id TEXT NOT NULL REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  filename TEXT NOT NULL,
  file_type TEXT,
  original_text TEXT,
  uploaded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_proposals (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  extracted_type TEXT, -- CLEANING | OPERATIONAL | DEADLINE | METRIC | INFO
  extracted_text TEXT,
  proposed_title TEXT,
  confidence REAL,
  review_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | CORRECTED | APPROVED | REJECTED
  approved_mapping TEXT, -- JSON, e.g. resulting task_template id
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL,
  period TEXT NOT NULL,
  target REAL,
  actual REAL,
  source TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS store_pnl_periods (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  period_label TEXT NOT NULL, -- e.g. "Period 8, 2026"
  net_sales_actual REAL,
  net_sales_plan REAL,
  net_sales_prior_year REAL,
  sss_pct REAL, -- Same Store Sales %
  sst_pct REAL, -- Same Store Transactions %
  check_average REAL, -- CK
  cogs_pct REAL, -- food cost %
  labor_pct REAL,
  controllable_profit_actual REAL, -- CP $
  controllable_profit_pct REAL, -- CP %
  restaurant_contribution REAL, -- RC
  gem_score REAL, -- legacy single-number field, superseded by the two headline metrics below
  gem_taste_score REAL, -- GEM: Taste of Food, this period's score
  gem_taste_goal REAL, -- GEM: Taste of Food, company goal
  gem_accuracy_score REAL, -- GEM: Accuracy of Order, this period's score
  gem_accuracy_goal REAL, -- GEM: Accuracy of Order, company goal
  pnl_file_ref TEXT, -- stored filename under data/private-uploads/store-pnl
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  outgoing_shift_id TEXT REFERENCES shifts(id),
  incoming_shift_id TEXT REFERENCES shifts(id),
  outgoing_pic_id TEXT REFERENCES users(id),
  incoming_pic_id TEXT REFERENCES users(id),
  generated_summary TEXT, -- JSON snapshot
  outgoing_note TEXT,
  status TEXT NOT NULL DEFAULT 'GENERATED', -- GENERATED | OUTGOING_COMPLETED | INCOMING_ACKNOWLEDGED
  outgoing_completed_at TEXT,
  incoming_acknowledged_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  actor_role TEXT,
  pic_id TEXT REFERENCES users(id),
  action TEXT NOT NULL, -- CREATED | EDITED | ASSIGNED | APPROVED | VERIFIED | COMPLETED | REOPENED | CANCELLED
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS associate_availability (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  associate_name TEXT NOT NULL,
  weekday INTEGER,
  start_time TEXT,
  end_time TEXT,
  effective_start TEXT,
  effective_end TEXT,
  source TEXT, -- RECURRING | TEMPORARY
  last_editor_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_requests (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  associate_name TEXT NOT NULL,
  request_type TEXT NOT NULL, -- FULL_DAY_OFF | LEAVE_EARLY | LATE_START | PARTIAL_DAY | TEMP_AVAILABILITY_CHANGE | OTHER
  requested_start_date TEXT NOT NULL,
  requested_end_date TEXT,
  requested_start_time TEXT,
  requested_end_time TEXT,
  received_via TEXT NOT NULL, -- TEXT | IN_PERSON | PHONE | WORKJAM_CHAT | OTHER
  received_by TEXT NOT NULL REFERENCES users(id),
  entered_by TEXT NOT NULL REFERENCES users(id),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_GM_APPROVAL', -- PENDING_GM_APPROVAL | APPROVED | DENIED
  gm_decision_by TEXT REFERENCES users(id),
  gm_decision_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_request_attachments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES schedule_requests(id),
  file_ref TEXT NOT NULL,
  attachment_type TEXT,
  uploaded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES schedule_requests(id),
  action TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_conflicts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'WARNING',
  associate_name TEXT,
  related_request_id TEXT REFERENCES schedule_requests(id),
  resolution_state TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shift_notes (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  shift_id TEXT REFERENCES shifts(id),
  author_id TEXT REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_store ON tasks(store_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_area ON cleaning_tasks(area_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_task_items_task ON cleaning_task_items(cleaning_task_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_schedule_requests_status ON schedule_requests(store_id, status);
CREATE INDEX IF NOT EXISTS idx_store_pnl_periods_store ON store_pnl_periods(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
