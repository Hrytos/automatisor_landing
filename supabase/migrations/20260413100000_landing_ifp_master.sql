-- One row per vendor domain. Updated in place (offerings, fits map, latest questioner run).
-- landing_page_ifp: insert-only leads (domain + email). domain FK -> landing_ifp_master (see 20260413110000).

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

comment on table public.landing_ifp_master is 'IFP vendor cache and latest funnel snapshot; one row per company domain.';
comment on column public.landing_ifp_master.offerings is 'Solution finder list; no selected offering required.';
comment on column public.landing_ifp_master.fits is 'Map keyed by normalized offering name -> fit profile (offering_name + good/bad fit).';
comment on column public.landing_ifp_master.questioner is 'Per-offering log map: offeringKey -> [{ run_id, completed_at, offering_label, segments[{ rank, name, questions[{ question, options, selected }] }] }].';
comment on column public.landing_ifp_master.final_segments is 'Per-offering log map: offeringKey -> [{ run_id, completed_at, offering_label, profiles[{ rank, name, axis, criteria, assumptions }] }].';

alter table public.landing_ifp_master enable row level security;

drop policy if exists landing_ifp_master_service_all on public.landing_ifp_master;
create policy landing_ifp_master_service_all
  on public.landing_ifp_master
  for all
  to authenticated
  using (true)
  with check (true);
