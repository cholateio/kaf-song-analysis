# kaf-song-analysis

## Project goal

花譜（KAF）cover 曲的 YouTube ingest + 音訊分析 pipeline：用 yt-dlp 抓音訊 →
Meyda 做每幀 spectrum 分析 → 打包成 binary blob 寫入 Supabase
（`kaf_songs` 表 + `song-blobs` storage bucket），供 3D 前端視覺化消費。前端消費者
為 **kaf-observatory**（本 repo 的 `docs/reference/clock-analysis-handover.md`
對應其同名檔；歷史名 virtual-music-clock）。

## Stack

- Language: Node.js ≥20（ESM，`"type": "module"`），pnpm
- 核心依賴: `meyda`（spectrum 特徵）、`@supabase/supabase-js`、`dotenv`、`minimist`
- 外部 CLI 依賴（不在 package.json）: **yt-dlp**（`src/youtube.mjs` 經 child_process 呼叫）、**ffmpeg**（LRA 由 `ebur128` 解析；preflight 會檢查兩者）
- Datastore: Supabase Postgres `kaf_songs` 表 + Storage bucket `song-blobs`（DDL 見 `supabase-schema.sql`）
- Run: `node analyzer.mjs --url "<youtube-url>" [--genre <tag>] [--force] [--dry-run]`
- Batch: `node batch.mjs urls.txt [--sleep <sec>]`（無人值守整夜批次，含限流退避）
- Test: `pnpm test`（node --test，自動抓所有 `*.test.mjs`：`src/title.test.mjs`、`generate-urls.test.mjs`、`analyzer.test.mjs`）

## File layout

- `analyzer.mjs` — CLI 進入點（單曲 ingest）
- `batch.mjs` — 依序批次跑 urls.txt
- `generate-urls.mjs` — 用 yt-dlp 掃 YouTube 頻道（`@virtual_kaf`）產出 urls；
  過濾例外寫在 `KEEP_IDS`（強制保留）／`DROP_IDS`（強制排除），產出的 txt
  是 gitignored 純產物，不要手改
- `lint-titles.mjs` — 標題 dry-run 檢查
- `src/youtube.mjs` — yt-dlp wrapper；`src/audio.mjs` — Meyda spectrum 抽取
- `src/clock_analysis.mjs` — 前端 live FFT 的離線移植版
- `src/binary_pack.mjs` — binary blob 打包；`src/db.mjs` — Supabase client / upsert
- `src/title.mjs`（+ .test.mjs）— 花譜曲名正規化（前端 A-Z 索引用）
- `supabase-schema.sql` — DB DDL
- `docs/reference/` — 給前端的交接文件（`data-contracts.md`＝資料格式權威來源、
  `clock-analysis-handover.md`＝clock 移植的 why + gotchas）
- `docs/assets/` — README 用圖（`melody-matrix.webp`＝kaf-observatory 星圖截圖）

## Constraints

- `docs/reference/data-contracts.md` 是資料格式的權威文件：binary layout 或 row shape 變更時，必須在同一個 commit
  bump `BIN_VERSION`（`src/binary_pack.mjs`）或 `metadata.schemaVersion`（`analyzer.mjs`）並更新該文件。
- `src/clock_analysis.mjs` 是前端 live FFT 的離線移植版，必須與它所鏡像的前端一起改，否則視覺會漂移。
- `urls-virtual_kaf.txt` 是 gitignored 產物，不手改；過濾例外只改 `generate-urls.mjs` 的 `KEEP_IDS` / `DROP_IDS`。
- `SUPABASE_SERVICE_KEY` 只放在 gitignored 的 `.env`（名稱見 `.env.example`），絕不進 git。
- Path-type constraints are mirrored in `kit.toml [protected]`; keep the two in sync (one glob per line).

## Conventions

- Conventional commits（`type(scope): 摘要`）；commit 前跑 `pnpm test`。
- 以 `video_id` 對帳，不用標題（頻道掃描拿英文標題、單曲 metadata 拿日文標題）。
- `README.md`（繁中，預設）與 `README.en.md`（英文）互為對照版本，改其中一份就要在同一個 commit 同步更新另一份。
- GitHub Actions: top-level `permissions: contents: read`, raised per job only when needed.
- GitHub Actions: pin every `uses:` to a 40-character commit SHA with a trailing `# vX.Y.Z` comment.

## Where to look

- `docs/DEVELOPMENT.md` — 指令、batch 限流、環境變數、輸出、gotchas
- `docs/reference/data-contracts.md` — row shape 與 binary layout（權威）
- `docs/reference/clock-analysis-handover.md` — clock 移植的 why + gotchas
- `docs/architecture/overview.svg` — 系統架構總覽
