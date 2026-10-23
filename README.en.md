# song-analysis

[繁體中文](README.md) | **English**

You want a music visualizer to react to real songs from a YouTube channel without analysing audio in the browser. Give it a video URL, or let it walk a whole channel, and each song becomes one database row of per-song features plus two binary files of frame-by-frame spectrum data at 60 frames per second, all in your own Supabase project.

```
$ node analyzer.mjs --url "https://www.youtube.com/watch?v=jpwy7kP8Pps" --dry-run
✓ video_id: jpwy7kP8Pps
✓ metadata: 【歌ってみた】猛独が襲う covered by 花譜 — KAF (259s, released 2018-10-31)
✓ analysis: 15509 frames, BPM 150 (conf 0.44)
✓ loudness range: LRA 3.2 LU
✓ clock_analysis: 15509 frames, 128 bins (fftSize 256)
✓ packed: analysis 1014.8 KB, clock 1.9 MB
✓ title: "【歌ってみた】猛独が襲う covered by 花譜" → "猛独が襲う【歌ってみた】"
✓ dry-run: row 505.0 B + blobs 2.9 MB = 2.9 MB (upload skipped)
```

- **Per-song features**: BPM with a confidence score, three spectral-centroid measures, EBU R128 loudness range, spectral contrast, and vocal-band onset rate and modulation, stored in a `metadata` JSON column.
- **Frame data**: an analysis file with 64 log-spaced bands, RMS loudness, centroid and a beat flag per frame, and a clock file with 128 FFT bins per frame that matches a Web Audio `AnalyserNode` with `fftSize` 256.
- **Whole channels**: `generate-urls.mjs` lists a channel's videos with yt-dlp, drops trailers, live versions and clips outside 125–600 seconds, and `batch.mjs` ingests the list overnight with pauses, one retry, and a file of failed URLs to rerun.
- **Safe reruns**: songs already in the table are skipped unless you pass `--force`, and `--dry-run` runs the full analysis without touching the database.

Input and output for one batch run:

```
# urls.txt: one URL per line, optional genre tag after a space
https://www.youtube.com/watch?v=jpwy7kP8Pps cover
https://youtu.be/abc12345678
```

```
kaf_songs row            video_id, title, artist, genre, release_date, metadata
analysis/<video_id>.bin  8-byte header + 67 bytes per frame
clock/<video_id>.bin     8-byte header + 128 bytes per frame
```

The channel default, video filters, genre tags and title clean-up are written for the KAF (花譜) channel; another artist's catalogue needs edits in `generate-urls.mjs` and `src/title.mjs`. Videos longer than 12 minutes are rejected.

## How it works

```
YouTube ──► yt-dlp ──► ffmpeg (48 kHz PCM, loudness) ──► Meyda + FFT per frame
                                                              │
                                     your Supabase: table row + two .bin files in Storage
```

Audio streams through memory and is never saved to disk. There is no server; everything runs on your machine.

## Install

You need Node.js 20 or newer with pnpm, `yt-dlp` and `ffmpeg` on your `PATH`, and a Supabase project of your own.

1. Clone the repo and run `pnpm install`.
2. In Supabase, open **SQL Editor** and run `supabase-schema.sql`. It creates the `kaf_songs` table with public read access.
3. Open **Storage → New bucket**, turn **Public bucket** on, and use the bucket name given at the top of `supabase-schema.sql`. The analyzer writes to that fixed name.
4. Copy `.env.example` to `.env` and fill in your project URL and the **service-role** key from **Project Settings → API**. The analyzer writes past row-level security, so the public anon key will not work.
5. Try one song with `node analyzer.mjs --url "<youtube-url>" --dry-run`, then run it again without `--dry-run` to save it.
6. For a whole channel, run `node generate-urls.mjs --channel <channel-videos-url> --out urls.txt`, then `node batch.mjs urls.txt`.

`--dry-run` needs no `.env`, so step 5 works before Supabase is set up.

## Privacy & security

- The service-role key stays in your local `.env` and is only sent to your own Supabase project. It bypasses row-level security, so keep it off shared machines.
- The table and the bucket are public for reading: anyone with your project URL and anon key can read the features and frame files. Nobody can write without the service-role key.
- Only the title, uploader, release date and derived numbers are stored. No audio or video leaves your machine.
- yt-dlp talks to YouTube directly from your computer, under YouTube's terms.

## License

[MIT](LICENSE). Audio features are computed with [Meyda](https://meyda.js.org/).
