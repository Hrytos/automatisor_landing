-- IFP snapshot on email reveal. Cache reads: offerings by domain; fit by domain + fit.offering_name.



alter table public.landing_page_ifp

  add column if not exists offerings jsonb,

  add column if not exists selected_offering text,

  add column if not exists fit jsonb,

  add column if not exists questioner jsonb,

  add column if not exists final_segments jsonb;



comment on column public.landing_page_ifp.offerings is 'Solution finder list (json array).';

comment on column public.landing_page_ifp.selected_offering is 'Chosen solution name (plain text).';

comment on column public.landing_page_ifp.fit is 'Object: offering_name + good/bad fit fields from the session fit step.';

comment on column public.landing_page_ifp.questioner is 'Object: { questions, answers } from step 4.';



create index if not exists landing_page_ifp_domain_created_idx

  on public.landing_page_ifp (domain, created_at desc);



create index if not exists landing_page_ifp_domain_fit_offering_idx

  on public.landing_page_ifp (domain, ((fit ->> 'offering_name')))

  where fit is not null;



drop policy if exists landing_page_ifp_select_authenticated on public.landing_page_ifp;

create policy landing_page_ifp_select_authenticated

  on public.landing_page_ifp

  for select

  to authenticated

  using (true);

