-- Run once on an existing project (table landing_page_ifp already exists).
-- Order: master -> backfill -> FK -> drop lead json columns.

-- 1) Master (skip if already applied)
create table if not exists public.landing_ifp_master (
  domain text not null,
  offerings jsonb,
  fits jsonb not null default '{}'::jsonb,
  questioner jsonb,
  final_segments jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint landing_ifp_master_pkey primary key (domain)
);

insert into public.landing_ifp_master (domain)
select distinct l.domain
from public.landing_page_ifp l
where not exists (
  select 1 from public.landing_ifp_master m where m.domain = l.domain
)
on conflict (domain) do nothing;

-- 2) FK (requires every lead.domain to exist in master)
alter table public.landing_page_ifp
  drop constraint if exists landing_page_ifp_domain_fkey;

alter table public.landing_page_ifp
  add constraint landing_page_ifp_domain_fkey
  foreign key (domain)
  references public.landing_ifp_master (domain)
  on delete restrict;

-- 3) Leads-only columns
drop index if exists public.landing_page_ifp_domain_fit_offering_idx;

alter table public.landing_page_ifp
  drop column if exists offerings,
  drop column if exists selected_offering,
  drop column if exists fit,
  drop column if exists questioner,
  drop column if exists final_segments;

create index if not exists landing_page_ifp_domain_created_idx
  on public.landing_page_ifp (domain, created_at desc);
