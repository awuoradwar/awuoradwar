-- Shift Ops data model (SQLite for local/dev).
-- A near-identical Postgres+RLS version lives in supabase_schema.sql for production deployment.
-- All primary keys are UUID text. All timestamps are ISO-8601 UTC strings set server-side.

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  language_default TEXT NOT NULL DEFAULT 'en',
  -- Current GEM standing -- unlike the P&L period numbers below (a lagging
  -- report, released once per multi-week period), GEM is a live figure that
  -- can move day to day, so it's a single current value on the store itself
  -- rather than a field on any one period. No history is kept, only what's
  -- true right now.
  gem_taste_score REAL,
  gem_taste_goal REAL,
  gem_accuracy_score REAL,
  gem_accuracy_goal REAL,
  gem_updated_by TEXT REFERENCES users(id),
  gem_updated_at TEXT,
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

-- A manager can be working that day without covering the store -- offsite
-- training, an area meeting -- so their day would otherwise show as blank
-- on the schedule and read as "off" rather than "elsewhere for work."
-- Deliberately NOT part of manager_shifts/shift_type: nothing here should
-- ever make someone PIC-eligible or an auto-assign candidate for that
-- window, so it's tracked as its own list of entries rather than a new
-- shift_type value threaded through that logic.
CREATE TABLE IF NOT EXISTS manager_activities (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  label TEXT NOT NULL, -- free text, e.g. "Training", "Area meeting"
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manager_activities_date ON manager_activities(store_id, date);

-- New associate training: GM-editable checklist per position (Counterhelp/
-- Cook/Kitchenhelp -- Cook and Kitchenhelp are distinct BOH positions), so
-- whichever manager is on shift when a step gets trained can check it off
-- and the next manager picks up exactly where training left off.
CREATE TABLE IF NOT EXISTS training_items (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  position TEXT NOT NULL, -- COUNTERHELP | COOK | KITCHENHELP | SHIFT_LEAD
  title TEXT NOT NULL,
  title_es TEXT,
  phase TEXT NOT NULL DEFAULT 'SHIFT', -- OPENING | SHIFT | CLOSING -- where this step falls in the shift, for grouping/ordering
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
  notes TEXT,
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
  trained_at TEXT NOT NULL,
  shift_type TEXT, -- MORNING | EVENING | DOUBLE -- which shift the training actually happened on
  notes TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_training_completions_unique ON training_completions(trainee_id, training_item_id);

-- One row per completion/retrain event (never overwritten) -- separate from
-- training_completions, which only ever holds the current/latest state for
-- the checkbox itself. This is what lets a manager look back at every past
-- retrain for one specific checklist item, each with its own note, and
-- correct a past note without losing the history around it.
CREATE TABLE IF NOT EXISTS training_completion_log (
  id TEXT PRIMARY KEY,
  trainee_id TEXT NOT NULL REFERENCES trainees(id),
  training_item_id TEXT NOT NULL REFERENCES training_items(id),
  trained_at TEXT NOT NULL,
  shift_type TEXT, -- MORNING | EVENING | DOUBLE
  trained_by TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_training_completion_log_item ON training_completion_log(trainee_id, training_item_id);

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
  title_es TEXT, -- Spanish title, shown instead of title for es-language viewers when set -- takes precedence over the template's own title_es, since this is the more specific, task-level override
  description TEXT,
  description_es TEXT,
  area TEXT,
  category TEXT,
  owner_id TEXT REFERENCES users(id),
  -- 1 when owner_id was set by the recurring-instance/schedule resolver
  -- rather than a manager explicitly picking someone -- lets a later
  -- schedule change safely re-resolve (or clear) this task's owner without
  -- ever overwriting a deliberate manual (re)assignment.
  owner_auto_assigned INTEGER NOT NULL DEFAULT 0,
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

-- Manager-written notes on a task -- e.g. why a task is still open ("waiting
-- on a part," "covering another shift"). Append-only, separate from the
-- task's own description (the task's definition, set at creation) and from
-- audit_events (system-generated log entries), same "explains itself, in
-- its own words, after the fact" role attendance_followups plays for
-- attendance events.
CREATE TABLE IF NOT EXISTS task_notes (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  note TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
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
  last_due_date TEXT, -- store-local YYYY-MM-DD this task's current open occurrence became due; drives missed-occurrence detection on the next reset
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
  notified_at TEXT, -- HH:MM store-local, when the employee actually notified (vs scheduled_time, when they were due in)
  notification_method TEXT, -- PHONE_CALL | TEXT | APP | IN_PERSON | OTHER
  attachment_ref TEXT, -- stored filename under data/private-uploads/attendance, e.g. a screenshot of the text/call log
  coverage_status TEXT, -- NEEDED | FOUND | NOT_FOUND | NOT_REQUIRED
  covering_person TEXT,
  note TEXT,
  recorded_by TEXT REFERENCES users(id),
  pic_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- Follow-up notes logged against an attendance event after the fact (e.g.
-- "called back, will be in by noon") -- append-only, separate from the
-- event's own `note` field, so a later update never overwrites/loses the
-- original entry.
CREATE TABLE IF NOT EXISTS attendance_followups (
  id TEXT PRIMARY KEY,
  attendance_event_id TEXT NOT NULL REFERENCES attendance_events(id),
  note TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
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

CREATE TABLE IF NOT EXISTS catering_orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  due_date TEXT NOT NULL, -- YYYY-MM-DD, the day the order is picked up/delivered; drives "due today" pinning
  pickup_time TEXT, -- HH:MM local, optional
  due_at TEXT, -- due_date+pickup_time combined into a store-timezone-correct UTC ISO, when a time was given
  customer_name TEXT,
  number_of_people INTEGER,
  channel TEXT NOT NULL DEFAULT 'PHONE', -- OLO | EZCATERING | IN_STORE | PHONE
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | COMPLETED | CANCELLED
  owner_id TEXT REFERENCES users(id),
  completed_by TEXT REFERENCES users(id),
  completed_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS waste_log_entries (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  item TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  price_per_unit REAL, -- times quantity = this entry's $ value, computed on read rather than stored; optional -- a manager often doesn't know the exact cost when logging waste
  reason TEXT, -- SPOILED | OVERPREP | UNDERPREP | DROPPED | QUALITY | OTHER, optional
  wasted_date TEXT NOT NULL, -- YYYY-MM-DD store-local, the day it happened (not necessarily the day it's logged)
  notes TEXT,
  logged_by TEXT REFERENCES users(id),
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
  cogs_pct REAL, -- food cost % actual
  cogs_theoretical_pct REAL, -- food cost % theoretical (ideal usage)
  labor_pct REAL,
  controllable_profit_actual REAL, -- CP $
  controllable_profit_pct REAL, -- CP %
  restaurant_contribution REAL, -- RC $
  restaurant_contribution_pct REAL, -- RC %
  gem_score REAL, -- legacy single-number field, superseded by the two headline metrics below
  gem_taste_score REAL, -- GEM: Taste of Food, this period's score
  gem_taste_goal REAL, -- GEM: Taste of Food, company goal
  gem_accuracy_score REAL, -- GEM: Accuracy of Order, this period's score
  gem_accuracy_goal REAL, -- GEM: Accuracy of Order, company goal
  pnl_file_ref TEXT, -- stored filename under data/private-uploads/store-pnl
  -- The actual date corporate released this period's P&L (every first
  -- Friday of a new period) -- distinct from created_at, which is just
  -- whenever a manager got around to typing the numbers into this app and
  -- can lag the real release by days. "Released this week" on Weekly
  -- Summary reads this field when set, falling back to created_at for
  -- periods entered before this existed.
  released_at TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- Weekly overtime + COGS/inventory-variance tracking, separate from the
-- P&L period above (which is a corporate 4-week period, not a calendar
-- week) -- lets a GM log what actually happened week to week, with notes
-- explaining an OT spike or a COGS goal miss, for trend-spotting between
-- P&L releases.
-- Superseded by weekly_ot_summaries/weekly_cogs_summaries below -- OT is
-- entered proactively for the week its schedule was just built for, while
-- COGS actual only exists once that week's Saturday inventory count closes
-- it out, so the two never share the same "which week is this" answer.
-- Table (and any rows already in it) kept only so createConnection's
-- one-time migration can still read out of it; nothing writes here anymore.
CREATE TABLE IF NOT EXISTS weekly_ops_summaries (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  week_start TEXT NOT NULL, -- YYYY-MM-DD, Sunday -- same week boundary as the Week page
  ot_foh_hours REAL,
  ot_boh_hours REAL,
  cogs_actual_pct REAL,
  cogs_goal_pct REAL,
  ot_notes TEXT,
  cogs_notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_ops_summaries_unique ON weekly_ops_summaries(store_id, week_start);

-- One row per week a GM logs overtime for -- typically the week whose
-- schedule was just built, so this is very often entered before or right as
-- that week starts, not after it ends.
CREATE TABLE IF NOT EXISTS weekly_ot_summaries (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  week_start TEXT NOT NULL, -- YYYY-MM-DD, Sunday -- the week this OT is for
  ot_foh_hours REAL,
  ot_boh_hours REAL,
  ot_notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_ot_summaries_unique ON weekly_ot_summaries(store_id, week_start);

-- One row per week a GM logs COGS actual/goal for -- the actual number only
-- exists once that week's Saturday inventory count is done, so this is
-- always entered after the week it describes has already ended (typically
-- early in the following week), never during or ahead of it.
CREATE TABLE IF NOT EXISTS weekly_cogs_summaries (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  week_start TEXT NOT NULL, -- YYYY-MM-DD, Sunday -- the week this COGS actually measures
  cogs_actual_pct REAL,
  cogs_goal_pct REAL,
  cogs_notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_cogs_summaries_unique ON weekly_cogs_summaries(store_id, week_start);

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
  request_type TEXT NOT NULL, -- FULL_DAY_OFF | LEAVE_EARLY | LATE_START | PARTIAL_DAY | TEMP_AVAILABILITY_CHANGE | SHIFT_SWAP | OTHER
  requested_start_date TEXT NOT NULL,
  requested_end_date TEXT,
  requested_start_time TEXT,
  requested_end_time TEXT,
  swap_with_name TEXT, -- SHIFT_SWAP only: who's covering/trading this shift
  swap_with_date TEXT, -- SHIFT_SWAP only: the date of swap_with_name's shift being picked up in exchange -- can differ from requested_start_date, since a swap doesn't have to be same-day
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
  text TEXT NOT NULL, -- legacy quick-note body; '' once a note uses title/sections instead
  title TEXT,
  title_es TEXT, -- auto-translated Spanish title -- see translationService.ts
  sections_json TEXT, -- JSON array of { topic, topicEs, subtopic, subtopicEs, bullets: string[], bulletsEs: string[] }, added via ensureColumn in db.ts
  remind_day_before INTEGER NOT NULL DEFAULT 0, -- when set, this note also shows in Today's Notes the calendar day before its own date (e.g. an upcoming area meeting's notes, so tomorrow's meeting isn't a surprise)
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_attachments (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES shift_notes(id) ON DELETE CASCADE,
  file_ref TEXT NOT NULL, -- stored filename under data/private-uploads/shift-notes
  original_name TEXT,
  content_type TEXT,
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
