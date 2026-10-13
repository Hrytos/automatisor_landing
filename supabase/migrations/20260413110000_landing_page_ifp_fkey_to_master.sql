-- Each lead row points at the vendor master row (same normalized domain).

insert into public.landing_ifp_master (domain)
select distinct l.domain
from public.landing_page_ifp l
where not exists (
  select 1 from public.landing_ifp_master m where m.domain = l.domain
)
on conflict (domain) do nothing;

alter table public.landing_page_ifp
  drop constraint if exists landing_page_ifp_domain_fkey;

alter table public.landing_page_ifp
  add constraint landing_page_ifp_domain_fkey
  foreign key (domain)
  references public.landing_ifp_master (domain)
  on delete restrict;

comment on constraint landing_page_ifp_domain_fkey on public.landing_page_ifp is
  'Lead events reference the IFP master row for that company domain.';
