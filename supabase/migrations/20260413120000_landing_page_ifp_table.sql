-- landing_page_ifp = lead events only. All IFP fields live on landing_ifp_master.
-- Run after landing_ifp_master (20260413100000) and FK (20260413110000).

comment on table public.landing_page_ifp is
  'Work-email conversions. domain FK -> landing_ifp_master; no IFP json here.';

drop index if exists public.landing_page_ifp_domain_fit_offering_idx;

alter table public.landing_page_ifp
  drop column if exists offerings,
  drop column if exists selected_offering,
  drop column if exists fit,
  drop column if exists questioner,
  drop column if exists final_segments;

create index if not exists landing_page_ifp_domain_created_idx
  on public.landing_page_ifp (domain, created_at desc);

-- Target shape (for new environments; alter above brings existing DB in line):
--
-- create table public.landing_page_ifp (
--   id uuid not null default gen_random_uuid(),
--   domain text not null,
--   email text not null,
--   created_at timestamptz not null default now(),
--   constraint landing_page_ifp_pkey primary key (id),
--   constraint landing_page_ifp_domain_fkey foreign key (domain)
--     references public.landing_ifp_master (domain) on delete restrict
-- );
