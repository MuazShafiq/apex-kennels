-- REVIEW-ONLY PostgreSQL schema for a FUTURE, DEDICATED Apex Neon project.
-- NOT applied to any live database. Staff auth policies are intentionally absent.
-- All money stored in integer PKR. Time-sensitive actions run server side.

create extension if not exists pgcrypto;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  constraint customer_contact_present check (nullif(btrim(coalesce(email,'')),'') is not null or nullif(btrim(coalesce(phone,'')),'') is not null)
);
create table public.pets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  name text not null,
  breed text,
  notes text,
  created_at timestamptz not null default now()
);
create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  source text not null check (source in ('google_form','website','staff')),
  external_submission_id text,
  start_date date not null,
  end_date date not null,
  accommodation_type text,
  status text not null default 'requested' check (status in ('requested','reviewing','approved','declined','cancelled','completed')),
  created_at timestamptz not null default now(),
  constraint date_range_ok check (end_date >= start_date),
  constraint external_identity_unique unique (source, external_submission_id)
);
create table public.booking_pets (
  booking_id uuid not null references public.booking_requests(id) on delete cascade,
  pet_id uuid not null references public.pets(id),
  primary key (booking_id,pet_id)
);
create table public.booking_extras (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.booking_requests(id) on delete cascade,
  label text not null,
  quantity integer not null check (quantity > 0),
  unit_price_pkr bigint not null check (unit_price_pkr >= 0)
);
create table public.pricing_versions (
  id uuid primary key default gen_random_uuid(),
  version_label text not null unique,
  rules jsonb not null,
  effective_from timestamptz,
  created_at timestamptz not null default now()
);
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('fixed','percent')),
  fixed_amount_pkr bigint,
  basis_points integer,
  is_active boolean not null default false,
  starts_on date,
  ends_on date,
  min_subtotal_pkr bigint,
  usage_limit integer,
  created_at timestamptz not null default now(),
  constraint valid_discount check ((kind='fixed' and fixed_amount_pkr >= 0 and basis_points is null)
    or (kind='percent' and basis_points between 0 and 10000 and fixed_amount_pkr is null)),
  constraint valid_promo_window check (ends_on is null or starts_on is null or ends_on>=starts_on),
  constraint valid_limits check ((usage_limit is null or usage_limit>0) and (min_subtotal_pkr is null or min_subtotal_pkr>=0))
);
create unique index promotions_case_insensitive_code on public.promotions (upper(code));
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.booking_requests(id),
  invoice_number text unique,
  status text not null default 'draft' check (status in ('draft','approved','sent','paid','void')),
  pricing_version_id uuid references public.pricing_versions(id),
  billed_days integer not null check (billed_days > 0),
  subtotal_pkr bigint not null check (subtotal_pkr >= 0),
  discount_total_pkr bigint not null default 0 check (discount_total_pkr >= 0),
  total_pkr bigint generated always as (subtotal_pkr - discount_total_pkr) stored,
  issued_at timestamptz,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint discount_not_excessive check (discount_total_pkr <= subtotal_pkr)
);
create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity integer not null check (quantity>0),
  unit_price_pkr bigint not null check (unit_price_pkr>=0),
  line_total_pkr bigint generated always as (quantity * unit_price_pkr) stored
);
create table public.invoice_discounts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  promotion_id uuid references public.promotions(id),
  label text not null,
  discount_pkr bigint not null check (discount_pkr >= 0)
);
create table public.form_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_submission_id text not null,
  booking_id uuid references public.booking_requests(id),
  received_at timestamptz not null default now(),
  constraint deduplicate_form_submissions unique (source, external_submission_id)
);

create index booking_dates_idx on public.booking_requests(start_date,end_date);
create index booking_customer_idx on public.booking_requests(customer_id);
create index invoices_booking_idx on public.invoices(booking_id);

-- Restrict all customer/pet/booking/payment data until the staff authorization
-- model is built. Backend service credentials must NEVER be sent to browsers.
alter table public.customers enable row level security;
alter table public.pets enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_pets enable row level security;
alter table public.booking_extras enable row level security;
alter table public.pricing_versions enable row level security;
alter table public.promotions enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_discounts enable row level security;
alter table public.form_ingestion_events enable row level security;
-- No public/authenticated policies are created yet. Deny by default.
