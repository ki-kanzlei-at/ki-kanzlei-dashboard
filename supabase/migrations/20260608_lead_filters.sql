-- Lead-Filter: Website-Tech-Stack + Umsatz (für Webdesigner-Zielgruppe & Firmengröße).
-- employee_count existiert bereits (20260227_add_legal_form_employee_count.sql).

-- Neue Lead-Spalten
alter table public.leads
  add column if not exists tech_stack text[],
  add column if not exists revenue    text;

comment on column public.leads.tech_stack is 'Erkannte Website-Technologien (shopify, wordpress, …) aus dem Homepage-Fingerprint.';
comment on column public.leads.revenue    is 'Umsatz-Schätzung (AI), z. B. "1-5 Mio €". Nur befüllt wenn Größen-Filter aktiv.';

-- GIN-Index für schnelle tech_stack-Filter (array contains)
create index if not exists idx_leads_tech_stack on public.leads using gin (tech_stack);

-- Filter-Spalten für search_jobs (Persistenz nach Restart + UI-Anzeige)
alter table public.search_jobs
  add column if not exists tech_stack      text,
  add column if not exists website_keyword text,
  add column if not exists min_employees   integer,
  add column if not exists max_results     integer;

comment on column public.search_jobs.tech_stack      is 'Komma-getrennte Tech-Filter (shopify,wordpress,…) oder NULL.';
comment on column public.search_jobs.website_keyword is 'Pflicht-Stichwort im Website-Inhalt oder NULL.';
comment on column public.search_jobs.min_employees   is 'Mindest-Mitarbeiterzahl (AI-Schätzung) oder NULL.';
comment on column public.search_jobs.max_results     is 'Obergrenze gespeicherter Leads pro Suche; NULL = unbegrenzt.';
