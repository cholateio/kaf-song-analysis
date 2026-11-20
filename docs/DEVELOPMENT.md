# Development

## Commands

| Command | Purpose |
|---|---|
| `node analyzer.mjs --url "<url>"` | Ingest one song (analysis → Supabase) |
| `node analyzer.mjs --url "<url>" --genre <tag>` | Also set the free-form genre tag (`cover`, `album1`, `live`…) |
| `node analyzer.mjs --url "<url>" --force` | Reprocess a `video_id` that is already in the table |
| `node analyzer.mjs --url "<url>" --dry-run` | Run the full pipeline but skip every Supabase write |
| `node generate-urls.mjs [--channel <url>] [--out <file>]` | Scan a channel with yt-dlp and write a URL list (default output `urls-virtual_kaf.txt`) |
| `node lint-titles.mjs <url-list>` | Dry-run of title normalisation only (fetches titles, no audio, no DB) |
| `node batch.mjs <url-list>` | Ingest a list sequentially, for unattended runs |
| `node scripts/update.mjs` | The release workflow below in one unattended step: scan, keep new IDs, check titles, ingest |
| `pnpm test` | The quality gate (`node --test`, picks up every `*.test.mjs`) |

Release workflow for a new upload: `generate-urls` → `lint-titles` (check the title rewrite) → `batch`. Regenerating the list is safe, and `batch` skips IDs already in the table, so the whole list works; it still sleeps between skipped lines, though, so a full 248-line list idles for about an hour. `scripts/update.mjs` avoids that by passing `batch` only the IDs missing from the table.

## Scheduled update

A Windows scheduled task named `kaf-song-analysis update` runs `scripts/scheduled-update.sh` in WSL every day at 01:00 (set up 2026-11-20). The wrapper sets `PATH` (nvm's node, and `~/.local/bin/yt-dlp` ahead of the outdated apt copy in `/usr/bin`), takes a lock so runs never overlap, and runs `scripts/update.mjs`:

1. `generate-urls.mjs` rewrites `urls-virtual_kaf.txt`;
2. IDs already in `kaf_songs` are dropped;
3. each new title goes through `parseTitle`; a title no rule matches is skipped and logged as `SKIPPED … no title rule matched`, because it would be stored as-is and mis-sort the A-Z index. Add a rule to `src/title.mjs`, then ingest it with `analyzer.mjs`;
4. the rest go through `batch.mjs`.

Output goes only to `~/.local/state/kaf-song-analysis/update.log` (last 2000 lines kept); nothing notifies. The task does not wake the PC and does not run missed starts after boot (user decision), so a day with the PC off or asleep at 01:00 is simply skipped; the next run catches up. Each run stops after 2 hours.

```
# create (from WSL, in a Windows directory such as /mnt/c)
schtasks.exe /Create /TN "kaf-song-analysis update" /SC DAILY /ST 01:00 /F \
  /TR "conhost.exe --headless wsl.exe -d Ubuntu-24.04 -e /home/<you>/kaf-song-analysis/scripts/scheduled-update.sh"
# run now / remove
schtasks.exe /Run /TN "kaf-song-analysis update"
schtasks.exe /Delete /TN "kaf-song-analysis update" /F
```

`conhost.exe --headless` keeps a console window from flashing up at 01:00. The 2-hour limit is set afterwards with PowerShell (`Set-ScheduledTask` with `Settings.ExecutionTimeLimit = "PT2H"`).

## Batch rate limiting

| Flag | Default | Meaning |
|---|---|---|
| `--sleep <sec>` | `15` | Pause between songs, with ±5 s jitter. `0` disables it |
| `--no-retry` | off | By default a failed song sleeps 90 s and retries once; this flag gives up immediately |

URLs that still fail are appended to `batch-failed-<timestamp>.txt` in the working directory. Rerun them with `node batch.mjs batch-failed-<timestamp>.txt --force`. Unknown flags are forwarded to `analyzer.mjs`.

URL list format: one URL per line, optional genre tag after whitespace; blank lines and lines starting with `#` are skipped.

## Environment variables

`.env` (gitignored; see `.env.example`). The analyzer exits early if either is missing, except under `--dry-run`.

- `SUPABASE_URL`: the Supabase project URL.
- `SUPABASE_SERVICE_KEY`: the service-role key, not the anon key. Upserts must bypass RLS.

## Output

One row in the `kaf_songs` table plus two blobs in the Storage bucket named by `BUCKET` in `src/db.mjs`: `analysis/<video_id>.bin` and `clock/<video_id>.bin`. The full row shape and binary layout are specified in `docs/reference/data-contracts.md`; when code and that document disagree, the code wins and the document is a bug.

## Gotchas

- **ffmpeg is a hard dependency.** Preflight checks both `yt-dlp` and `ffmpeg`. The loudness range (LRA) is parsed from ffmpeg's `ebur128` stderr.
- **12-minute cap.** `MAX_DURATION_SEC` in `analyzer.mjs` rejects longer videos; change that line to ingest longer ones.
- **Reruns need `--force`.** An existing `video_id` is skipped silently.
- **The URL list is a generated artifact.** `urls-virtual_kaf.txt` is gitignored and fully overwritten; `generate-urls.mjs` is the source of truth. Exceptions to the filters live in two ID sets there: `KEEP_IDS` (live versions with no studio release, which the live filter would otherwise drop) and `DROP_IDS` (announcement and anniversary clips that pass the length and title filters but are not songs). Never hand-edit the text file; edit those sets instead. `pnpm test` checks the two sets do not overlap.
- **One video, two titles.** A channel scan (`--flat-playlist`) returns the English title; the single-video metadata fetch returns the Japanese one, and that is what gets stored. Reconciling a channel list against the table by title will not line up; use `video_id`.
- **Two independent version numbers.** `BIN_VERSION` in `src/binary_pack.mjs` (blob header, currently 1) and `metadata.schemaVersion` in `analyzer.mjs` (row shape, currently 2). A binary layout change must bump the version and update `docs/reference/data-contracts.md` in the same commit.
- **`src/clock_analysis.mjs` is an offline port of a front end's live FFT.** It must change together with the visualizer it mirrors, or the visuals drift. Background is in `docs/reference/clock-analysis-handover.md`.
