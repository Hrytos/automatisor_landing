-- Run if you already applied an earlier draft with selected_offering jsonb / offering_name column.

alter table public.landing_page_ifp
  drop column if exists offering_name;

alter table public.landing_page_ifp
  drop column if exists selected_offering;

alter table public.landing_page_ifp
  add column if not exists selected_offering text;

alter table public.landing_page_ifp
  add column if not exists questioner jsonb;

drop index if exists landing_page_ifp_domain_offering_fit_idx;

create index if not exists landing_page_ifp_domain_fit_offering_idx
  on public.landing_page_ifp (domain, ((fit ->> 'offering_name')))
  where fit is not null;
