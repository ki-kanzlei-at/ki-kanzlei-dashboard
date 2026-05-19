-- Add filter columns to search_jobs so that pending jobs can be restored after
-- server restart and so the UI can show the filters that were applied per job.
-- Previously these flags lived only in the in-process scheduler memory.

alter table public.search_jobs
  add column if not exists city            text,
  add column if not exists company_type    text,
  add column if not exists require_ceo     boolean not null default false,
  add column if not exists require_email   boolean not null default false,
  add column if not exists require_website boolean not null default false;

comment on column public.search_jobs.city            is 'Optionale Stadt-Eingrenzung zusätzlich zu location (Region).';
comment on column public.search_jobs.company_type    is 'Rechtsform-Filter (gmbh, ag, …) oder NULL für alle.';
comment on column public.search_jobs.require_ceo     is 'Pipeline-Skip wenn kein Entscheider gefunden.';
comment on column public.search_jobs.require_email   is 'Pipeline-Skip wenn keine E-Mail gefunden.';
comment on column public.search_jobs.require_website is 'Pipeline-Skip wenn keine Website gefunden.';
