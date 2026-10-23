# song-analysis

**繁體中文** | [English](README.en.md)

你想讓音樂視覺化效果跟著某個 YouTube 頻道的真實歌曲動起來，又不想在瀏覽器裡分析音訊。給它一個影片網址，或讓它走過整個頻道，每首歌就會變成資料庫裡的一列（存放整首歌的特徵），外加兩個二進位檔（存放每秒 60 幀、逐幀的頻譜資料），全部存在你自己的 Supabase 專案裡。

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

- **整首歌的特徵**：附信心分數的 BPM、三種頻譜重心（spectral centroid）指標、EBU R128 響度範圍、頻譜對比，以及人聲頻段的起音率（onset rate）和調變，存在 `metadata` 這個 JSON 欄位裡。
- **逐幀資料**：分析檔每一幀有 64 個對數間隔的頻帶、RMS 響度、頻譜重心和節拍旗標；clock 檔每一幀有 128 個 FFT bin，和 `fftSize` 為 256 的 Web Audio `AnalyserNode` 結果一致。
- **整個頻道**：`generate-urls.mjs` 用 yt-dlp 列出頻道的影片，排除預告、live 版本和長度不在 125–600 秒之間的片段；`batch.mjs` 再整夜依清單匯入，中間會暫停、失敗重試一次，並把失敗的網址寫進一個檔案方便重跑。
- **可以放心重跑**：已經在資料表裡的歌會被跳過，除非你加上 `--force`；`--dry-run` 會跑完整個分析，但完全不動資料庫。

一次批次執行的輸入與輸出：

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

預設頻道、影片過濾條件、曲風標籤和標題整理規則都是針對花譜（KAF）的頻道寫的；換成其他歌手的作品，需要修改 `generate-urls.mjs` 和 `src/title.mjs`。超過 12 分鐘的影片會被拒絕。

## 它怎麼運作

```
YouTube ──► yt-dlp ──► ffmpeg（48 kHz PCM、響度） ──► Meyda + 逐幀 FFT
                                                           │
                                  你的 Supabase：資料表一列 + Storage 裡的兩個 .bin 檔
```

音訊以串流方式經過記憶體，從不存到磁碟上。沒有伺服器，所有東西都在你的電腦上執行。

## 安裝

需要：Node.js 20 以上和 pnpm、`PATH` 裡找得到 `yt-dlp` 和 `ffmpeg`，以及一個你自己的 Supabase 專案。

1. Clone 本 repo，執行 `pnpm install`。
2. 在 Supabase 打開 **SQL Editor**，執行 `supabase-schema.sql`。它會建立開放公開讀取的 `kaf_songs` 資料表。
3. 打開 **Storage → New bucket**，開啟 **Public bucket**，bucket 名稱使用 `supabase-schema.sql` 開頭寫的那個。分析程式會寫入這個固定名稱。
4. 把 `.env.example` 複製成 `.env`，填上你的專案 URL，以及 **Project Settings → API** 裡的 **service-role** key。分析程式寫入時會略過 row-level security，所以公開的 anon key 不能用。
5. 先用 `node analyzer.mjs --url "<youtube-url>" --dry-run` 試一首歌，再拿掉 `--dry-run` 跑一次把它存起來。
6. 要處理整個頻道，先執行 `node generate-urls.mjs --channel <channel-videos-url> --out urls.txt`，再執行 `node batch.mjs urls.txt`。

`--dry-run` 不需要 `.env`，所以在設定好 Supabase 之前就能做第 5 步。

## 隱私與安全

- service-role key 只放在你本機的 `.env`，也只會送到你自己的 Supabase 專案。它會繞過 row-level security，所以別放在共用的電腦上。
- 資料表和 bucket 都開放公開讀取：任何拿到你專案 URL 和 anon key 的人，都能讀取特徵和逐幀檔案。沒有 service-role key 就沒辦法寫入。
- 只儲存標題、上傳者、發行日期和計算出來的數值。音訊和影片都不會離開你的電腦。
- yt-dlp 直接從你的電腦連到 YouTube，並受 YouTube 的服務條款約束。

## 授權

[MIT](LICENSE)。音訊特徵使用 [Meyda](https://meyda.js.org/) 計算。
