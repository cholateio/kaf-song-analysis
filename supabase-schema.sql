-- Canonical fresh-install DDL for the song-analysis project.
-- Table name is lowercase since the 0004 rename (2026-10-09, kaf-observatory repo); no quoting needed.
-- For a description of the metadata JSONB shape and the binary blob format
-- used for analysis + clock_analysis, see docs/reference/data-contracts.md.
--
-- Prerequisite: in the Supabase dashboard, create a public Storage bucket
-- named 'song-blobs' before running analyzer.mjs. The analyzer uploads
-- per-song binary blobs to:
--   song-blobs/analysis/<video_id>.bin
--   song-blobs/clock/<video_id>.bin

create table if not exists kaf_songs (
  id             uuid primary key default gen_random_uuid(),
  video_id       text        not null unique,
  title          text        not null,
  artist         text,
  genre          text,
  release_date   date,
  metadata       jsonb       not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists songs_updated_at_idx on kaf_songs (updated_at desc);

-- Row Level Security: the frontend reads with the anon key, so expose SELECT
-- publicly; there is deliberately no INSERT/UPDATE/DELETE policy, so anon and
-- authenticated clients cannot write. analyzer.mjs writes with the
-- service-role key (src/db.mjs), which bypasses RLS.
alter table kaf_songs enable row level security;

drop policy if exists "kaf_songs public read" on kaf_songs;
create policy "kaf_songs public read"
  on kaf_songs
  for select
  to anon, authenticated
  using (true);
