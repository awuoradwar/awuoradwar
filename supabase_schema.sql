-- Shift Ops -- Postgres/Supabase production schema.
--
-- This is the deployment target described in the product spec (section 22):
-- Supabase Postgres + Auth + Storage + Realtime + Row Level Security. The
-- app currently runs against src/lib/schema.sql (SQLite) for local
-- development with zero setup. This file is the equivalent schema for
-- Supabase, plus the RLS policies the spec requires ("Row Level Security by
-- store membership and role", "PIC status does not automatically grant
-- permanent admin rights", "server-side authorization for approvals,
-- verification and administrative edits").
--
-- HOW TO MIGRATE FROM THE SQLITE DEV BUILD TO SUPABASE:
--   1. Create a Supabase project, run this file in the SQL editor.
--   2. Swap src/lib/db.ts for a Supabase client (see README "Going to
--      production" section) -- the table/column names below intentionally
--      mirror schema.sql exactly so the service-layer SQL shape barely
--      changes.
--   3. Move auth (src/lib/auth.ts) onto Supabase Auth; keep `users.position`
--      and `store_memberships` as the source of truth for role/permission
--      checks (see src/lib/permissions.ts) rather than anything client-set.
--   4. Point file uploads (schedule_request_attachments, documents) at
--      Supabase Storage private buckets with signed URLs instead of the
--      placeholder file_ref/original_text text fields.

create extension if not exists "pgcrypto";

create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Chicago',
  language_default text not null default 'en',
  created_at timestamptz not null default now()
);

-- Mirrors auth.users (Supabase Auth) 1:1 via id. Position/permissions live
-- here, never in client-editable auth metadata.
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text unique not null,
  position text not null check (position in ('GM','ASSISTANT_MANAGER','CHEF','VISITING_MANAGER','ASSOCIATE')),
  language text not null default 'en' check (language in ('en','es')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table store_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  store_id uuid not null references stores(id),
  role text not null,
  effective_start date,
  effective_end date,
  active boolean not null default true
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  date date not null,
  start_time time,
  end_time time,
  pic_user_id uuid references users(id),
  status text not null default 'OPEN' check (status in ('OPEN','ACTIVE','HANDED_OFF','CLOSED')),
  created_at timestamptz not null default now()
);

create table task_templates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  title text not null,
  description text,
  area text,
  category text,
  recurrence_type text not null check (recurrence_type in ('DAILY','WEEKDAYS','WEEKLY','BIWEEKLY','MONTHLY','ONE_TIME','CUSTOM')),
  recurrence_config jsonb,
  default_owner_position text,
  effort text not null default 'STANDARD' check (effort in ('QUICK','STANDARD','MAJOR')),
  verification_required boolean not null default false,
  source text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  template_id uuid references task_templates(id),
  title text not null,
  description text,
  area text,
  category text,
  owner_id uuid references users(id),
  support_ids uuid[],
  due_at timestamptz,
  scheduled_for text check (scheduled_for in ('TODAY','NEXT_SHIFT','TOMORROW','LATER_THIS_WEEK','DATE')),
  scheduled_date date,
  effort text not null default 'STANDARD',
  severity text not null default 'NORMAL' check (severity in ('NORMAL','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','COMPLETE','CARRIED_FORWARD','CANCELLED')),
  verification_required boolean not null default false,
  verified_by uuid references users(id),
  verified_at timestamptz,
  depends_on_task_id uuid references tasks(id),
  source text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  completed_by uuid references users(id),
  completed_at timestamptz,
  cancel_reason text,
  last_edited_by uuid references users(id),
  last_edited_at timestamptz
);

create table task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id),
  action text not null,
  actor_id uuid references users(id),
  pic_id uuid references users(id),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table cleaning_areas (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  name text not null,
  category text not null check (category in ('FOH','BOH','FACILITIES')),
  owner_id uuid references users(id),
  default_owner_position text,
  created_at timestamptz not null default now()
);

create table cleaning_tasks (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references cleaning_areas(id),
  title text not null,
  associate_name text,
  manager_owner_id uuid references users(id),
  status text not null default 'ASSIGNED' check (status in ('ASSIGNED','COMPLETED','VERIFIED','REOPENED')),
  photo_required boolean not null default false,
  photo_url text,
  completed_by uuid references users(id),
  completed_at timestamptz,
  verified_by uuid references users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table attendance_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  shift_id uuid references shifts(id),
  employee_name text not null,
  type text not null check (type in ('CALL_IN','LATE','NO_SHOW','LEFT_EARLY','SENT_HOME')),
  scheduled_time timestamptz,
  actual_time timestamptz,
  minutes_late integer,
  coverage_status text check (coverage_status in ('NEEDED','FOUND','NOT_REQUIRED')),
  covering_person text,
  note text,
  recorded_by uuid references users(id),
  pic_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table guest_recoveries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  contact_channel text not null check (contact_channel in ('PHONE','IN_STORE')),
  order_channel text not null check (order_channel in ('ONLINE','IN_STORE','DRIVE_THRU')),
  issue_category text not null,
  description text,
  item_description text,
  value_estimate numeric,
  replacement_status text not null default 'PENDING' check (replacement_status in ('PENDING','APPROVED','COMPLETED','NOT_REQUIRED')),
  approved_by uuid references users(id),
  approved_at timestamptz,
  completed_by uuid references users(id),
  completed_at timestamptz,
  follow_up_task_id uuid references tasks(id),
  created_by uuid references users(id),
  pic_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table borrowed_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  borrowed_from text not null,
  item text not null,
  quantity numeric,
  unit text,
  settlement_method text check (settlement_method in ('RETURN_PRODUCT','CRUNCHTIME_TRANSFER','PENDING_CONFIRMATION')),
  owner_id uuid references users(id),
  status text not null default 'OPEN' check (status in ('OPEN','SETTLEMENT_SELECTED','RETURN_PENDING','SETTLED')),
  completed_by uuid references users(id),
  completed_at timestamptz,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table issues (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  category text not null,
  description text not null,
  severity text not null default 'NORMAL' check (severity in ('NORMAL','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','WAITING','RESOLVED','REOPENED')), -- WAITING doubles as "needs follow-up" for work orders
  due_date date, -- when this work order needs attention by (nullable -- no specific date)
  owner_id uuid references users(id),
  resolution text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table issue_updates (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id),
  note text not null,
  actor_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table acknowledgements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  title text not null,
  source text,
  required_associates text[],
  responsible_manager_id uuid references users(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table acknowledgement_completions (
  id uuid primary key default gen_random_uuid(),
  acknowledgement_id uuid not null references acknowledgements(id),
  associate_name text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  verified_by uuid references users(id),
  verified_at timestamptz
);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  type text not null check (type in ('GEM_CALL','AREA_WEEKLY')),
  weekday integer not null,
  start_time time not null,
  end_time time not null,
  conditional boolean not null default false,
  required_state text,
  created_at timestamptz not null default now()
);

create table meeting_week_state (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id),
  week_of date not null,
  required_state text not null default 'REQUIRED',
  set_by uuid references users(id),
  set_at timestamptz
);

create table meeting_actions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id),
  week_of date,
  task_id uuid not null references tasks(id)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  filename text not null,
  file_type text,
  storage_path text, -- Supabase Storage object path (private bucket)
  original_text text,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table import_proposals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id),
  extracted_type text check (extracted_type in ('CLEANING','OPERATIONAL','DEADLINE','METRIC','INFO')),
  extracted_text text,
  proposed_title text,
  confidence numeric,
  review_status text not null default 'PENDING' check (review_status in ('PENDING','CORRECTED','APPROVED','REJECTED')),
  approved_mapping jsonb,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table metrics (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  name text not null,
  period text not null,
  target numeric,
  actual numeric,
  source text,
  created_at timestamptz not null default now()
);

create table store_pnl_periods (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  period_label text not null,
  net_sales_actual numeric,
  net_sales_plan numeric,
  net_sales_prior_year numeric,
  sss_pct numeric, -- Same Store Sales %
  sst_pct numeric, -- Same Store Transactions %
  check_average numeric, -- CK
  cogs_pct numeric, -- food cost %
  labor_pct numeric,
  controllable_profit_actual numeric, -- CP $
  controllable_profit_pct numeric, -- CP %
  restaurant_contribution numeric, -- RC
  gem_score numeric,
  storage_path text, -- Supabase Storage object path (private bucket) for the uploaded P&L document
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table handoffs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  outgoing_shift_id uuid references shifts(id),
  incoming_shift_id uuid references shifts(id),
  outgoing_pic_id uuid references users(id),
  incoming_pic_id uuid references users(id),
  generated_summary jsonb,
  outgoing_note text,
  status text not null default 'GENERATED' check (status in ('GENERATED','OUTGOING_COMPLETED','INCOMING_ACKNOWLEDGED')),
  outgoing_completed_at timestamptz,
  incoming_acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

-- Append-only. No UPDATE/DELETE policy is granted to any role below.
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid references users(id),
  actor_role text,
  pic_id uuid references users(id),
  action text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table associate_availability (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  associate_name text not null,
  weekday integer,
  start_time time,
  end_time time,
  effective_start date,
  effective_end date,
  source text check (source in ('RECURRING','TEMPORARY')),
  last_editor_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table schedule_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  associate_name text not null,
  request_type text not null check (request_type in ('FULL_DAY_OFF','LEAVE_EARLY','LATE_START','PARTIAL_DAY','TEMP_AVAILABILITY_CHANGE','OTHER')),
  requested_start_date date not null,
  requested_end_date date,
  requested_start_time time,
  requested_end_time time,
  received_via text not null check (received_via in ('TEXT','IN_PERSON','PHONE','WORKJAM_CHAT','OTHER')),
  received_by uuid not null references users(id),
  entered_by uuid not null references users(id),
  notes text,
  status text not null default 'PENDING_GM_APPROVAL' check (status in ('PENDING_GM_APPROVAL','APPROVED','DENIED')),
  gm_decision_by uuid references users(id),
  gm_decision_at timestamptz,
  created_at timestamptz not null default now()
);

create table schedule_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references schedule_requests(id),
  storage_path text not null, -- Supabase Storage object path (private bucket)
  attachment_type text,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table schedule_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references schedule_requests(id),
  action text not null,
  actor_id uuid references users(id),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table schedule_conflicts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  type text not null,
  severity text not null default 'WARNING',
  associate_name text,
  related_request_id uuid references schedule_requests(id),
  resolution_state text not null default 'OPEN',
  created_at timestamptz not null default now()
);

create table shift_notes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  shift_id uuid references shifts(id),
  author_id uuid references users(id),
  text text not null,
  created_at timestamptz not null default now()
);

-- Idempotency ledger for offline-queue writes (spec section 32).
create table idempotency_keys (
  idempotency_key uuid primary key,
  entity_type text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now()
);

create index idx_tasks_store on tasks(store_id, status);
create index idx_tasks_due on tasks(due_at);
create index idx_cleaning_tasks_area on cleaning_tasks(area_id);
create index idx_audit_entity on audit_events(entity_type, entity_id);
create index idx_schedule_requests_status on schedule_requests(store_id, status);

-- ============================================================
-- Row Level Security
-- ============================================================
-- Model: every store-scoped table is readable/writable only by users with
-- an active store_memberships row for that store. Administrative actions
-- (user management, template management, store config, schedule-request
-- decisions) are additionally gated to position = 'GM' -- mirroring
-- src/lib/permissions.ts exactly so client and server enforce the same
-- rule. audit_events grants INSERT to authenticated members but no
-- UPDATE/DELETE to anyone (append-only, enforced at the database level,
-- not just in application code).

create or replace function is_store_member(target_store uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from store_memberships m
    where m.store_id = target_store and m.user_id = auth.uid() and m.active
  );
$$;

create or replace function is_store_gm(target_store uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from store_memberships m
    join users u on u.id = m.user_id
    where m.store_id = target_store and m.user_id = auth.uid() and m.active and u.position = 'GM'
  );
$$;

alter table stores enable row level security;
alter table users enable row level security;
alter table store_memberships enable row level security;
alter table shifts enable row level security;
alter table task_templates enable row level security;
alter table tasks enable row level security;
alter table task_events enable row level security;
alter table cleaning_areas enable row level security;
alter table cleaning_tasks enable row level security;
alter table attendance_events enable row level security;
alter table guest_recoveries enable row level security;
alter table borrowed_items enable row level security;
alter table issues enable row level security;
alter table issue_updates enable row level security;
alter table acknowledgements enable row level security;
alter table acknowledgement_completions enable row level security;
alter table meetings enable row level security;
alter table meeting_week_state enable row level security;
alter table meeting_actions enable row level security;
alter table documents enable row level security;
alter table import_proposals enable row level security;
alter table metrics enable row level security;
alter table store_pnl_periods enable row level security;
alter table handoffs enable row level security;
alter table audit_events enable row level security;
alter table associate_availability enable row level security;
alter table schedule_requests enable row level security;
alter table schedule_request_attachments enable row level security;
alter table schedule_request_events enable row level security;
alter table schedule_conflicts enable row level security;
alter table shift_notes enable row level security;

-- Store-scoped tables: member read/write.
create policy store_member_all on stores for select using (is_store_member(id));
create policy store_member_all on shifts for all using (is_store_member(store_id));
create policy store_member_all on task_templates for select using (is_store_member(store_id));
create policy gm_manage_templates on task_templates for insert with check (is_store_gm(store_id));
create policy gm_update_templates on task_templates for update using (is_store_gm(store_id));
create policy store_member_all on tasks for all using (is_store_member(store_id));
create policy store_member_read on task_events for select using (
  exists (select 1 from tasks t where t.id = task_id and is_store_member(t.store_id))
);
create policy store_member_all on cleaning_areas for all using (is_store_member(store_id));
create policy store_member_all on cleaning_tasks for all using (
  exists (select 1 from cleaning_areas a where a.id = area_id and is_store_member(a.store_id))
);
create policy store_member_all on attendance_events for all using (is_store_member(store_id));
create policy store_member_all on guest_recoveries for all using (is_store_member(store_id));
create policy store_member_all on borrowed_items for all using (is_store_member(store_id));
create policy store_member_all on issues for all using (is_store_member(store_id));
create policy store_member_all on issue_updates for all using (
  exists (select 1 from issues i where i.id = issue_id and is_store_member(i.store_id))
);
create policy store_member_all on acknowledgements for all using (is_store_member(store_id));
create policy store_member_all on acknowledgement_completions for all using (
  exists (select 1 from acknowledgements a where a.id = acknowledgement_id and is_store_member(a.store_id))
);
create policy store_member_all on meetings for select using (is_store_member(store_id));
create policy store_member_all on meeting_week_state for all using (
  exists (select 1 from meetings m where m.id = meeting_id and is_store_member(m.store_id))
);
create policy store_member_all on meeting_actions for select using (
  exists (select 1 from meetings m where m.id = meeting_id and is_store_member(m.store_id))
);
create policy store_member_all on documents for all using (is_store_member(store_id));
create policy store_member_all on import_proposals for all using (
  exists (select 1 from documents d where d.id = document_id and is_store_member(d.store_id))
);
create policy store_member_all on metrics for select using (is_store_member(store_id));
-- Store Profile (P&L / KPI periods): any store member can read; only the GM
-- can add a new period. Periods are append-only, like a Trends report --
-- there is no update policy, a correction is a new period entry.
create policy store_member_read on store_pnl_periods for select using (is_store_member(store_id));
create policy gm_manage_pnl_periods on store_pnl_periods for insert with check (is_store_gm(store_id));
create policy store_member_all on handoffs for all using (is_store_member(store_id));
create policy store_member_all on associate_availability for all using (is_store_member(store_id));

-- Schedule requests: any store member can read/insert; only GM (or the
-- application's service role, for the trusted server-side decide action)
-- can update status. Mirrors "any manager can enter, GM decides".
create policy store_member_read on schedule_requests for select using (is_store_member(store_id));
create policy store_member_insert on schedule_requests for insert with check (is_store_member(store_id));
create policy gm_decide on schedule_requests for update using (is_store_gm(store_id));
create policy store_member_all on schedule_request_attachments for all using (
  exists (select 1 from schedule_requests r where r.id = request_id and is_store_member(r.store_id))
);
create policy store_member_read on schedule_request_events for select using (
  exists (select 1 from schedule_requests r where r.id = request_id and is_store_member(r.store_id))
);
create policy store_member_all on schedule_conflicts for select using (is_store_member(store_id));
create policy store_member_all on shift_notes for all using (is_store_member(store_id));

-- Users / memberships: read within your own store(s); only GM can manage
-- membership/user rows for the store (mirrors permissions.ts "users.manage").
create policy read_self_or_store on users for select using (
  id = auth.uid() or exists (
    select 1 from store_memberships m1
    join store_memberships m2 on m1.store_id = m2.store_id
    where m1.user_id = auth.uid() and m1.active and m2.user_id = users.id and m2.active
  )
);
create policy store_member_read on store_memberships for select using (is_store_member(store_id));
create policy gm_manage_membership on store_memberships for insert with check (is_store_gm(store_id));
create policy gm_update_membership on store_memberships for update using (is_store_gm(store_id));

-- Audit events: append-only. Members can read and insert; nobody gets
-- update/delete policies, so those operations are rejected outright.
create policy store_member_read_audit on audit_events for select using (
  pic_id is null or exists (
    select 1 from store_memberships m where m.user_id = auth.uid() and m.active
  )
);
create policy authenticated_insert_audit on audit_events for insert with check (auth.uid() is not null);
