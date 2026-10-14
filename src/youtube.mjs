import { spawn } from 'node:child_process';

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const YTDLP_BASE_ARGS = ['--js-runtimes', 'node', '--no-warnings'];

export function parseVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;

  let u;
  try { u = new URL(trimmed); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return VIDEO_ID_RE.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') {
      const id = u.searchParams.get('v');
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
    const m = u.pathname.match(/^\/(?:shorts|embed|v|live)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

function videoUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function runCommand(cmd, args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';
    let size = 0;
    child.stdout.on('data', d => {
      size += d.length;
      if (size > maxBuffer) {
        child.kill();
        reject(new Error(`${cmd} stdout exceeded ${maxBuffer} bytes`));
        return;
      }
      chunks.push(d);
    });
    child.stderr.on('data', d => { stderr += d.toString('utf8'); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout: Buffer.concat(chunks).toString('utf8'), stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim() || '(no stderr)'}`));
    });
  });
}

function ymdToIso(ymd) {
  if (!ymd || !/^\d{8}$/.test(ymd)) return null;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

export async function fetchMetadata(videoId) {
  const { stdout } = await runCommand('yt-dlp', [
    ...YTDLP_BASE_ARGS,
    '--dump-json',
    '--skip-download',
    videoUrl(videoId),
  ]);
  const info = JSON.parse(stdout);
  if (info.is_live === true || info.live_status === 'is_live') {
    throw new Error('video is a live stream in progress; cannot analyze');
  }
  return {
    videoId: info.id,
    title: info.title,
    artist: info.uploader || info.channel || null,
    duration: Number(info.duration) || 0,
    releaseDate: ymdToIso(info.release_date) || ymdToIso(info.upload_date),
  };
}

export function spawnAudioPipeline(videoId) {
  const ytdlp = spawn('yt-dlp', [
    ...YTDLP_BASE_ARGS,
    '-f', 'bestaudio',
    '-o', '-',
    '--quiet',
    videoUrl(videoId),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  // -loglevel info required for the ebur128 summary (integrated loudness + LRA)
  // to reach stderr. framelog=verbose suppresses per-frame ebur128 lines at
  // info level; only the final summary survives.
  const ffmpeg = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'info',
    '-nostats',
    '-i', 'pipe:0',
    '-af', 'ebur128=framelog=verbose',
    '-f', 'f32le',
    '-ac', '1',
    '-ar', '48000',
    'pipe:1',
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  let ytdlpStderr = '';
  let ffmpegStderr = '';
  ytdlp.stderr.on('data', d => { ytdlpStderr += d.toString('utf8'); });
  ffmpeg.stderr.on('data', d => { ffmpegStderr += d.toString('utf8'); });

  ytdlp.stdout.on('error', () => {});
  ffmpeg.stdin.on('error', () => {});
  ytdlp.stdout.pipe(ffmpeg.stdin);

  ytdlp.on('error', err => {
    try { ffmpeg.kill('SIGKILL'); } catch {}
    ffmpeg.emit('error', new Error(`yt-dlp spawn failed: ${err.message}`));
  });

  const done = new Promise((resolve, reject) => {
    let ytdlpClosed = false;
    let ffmpegClosed = false;
    let ytdlpCode = null;
    let ffmpegCode = null;
    const check = () => {
      if (ytdlpClosed && ffmpegClosed) {
        if (ffmpegCode === 0) resolve();
        else if (ytdlpCode !== 0) reject(new Error(`yt-dlp exited ${ytdlpCode}: ${ytdlpStderr.trim() || '(no stderr)'}`));
        else reject(new Error(`ffmpeg exited ${ffmpegCode}: ${ffmpegStderr.trim() || '(no stderr)'}`));
      }
    };
    ytdlp.on('close', c => { ytdlpClosed = true; ytdlpCode = c; check(); });
    ffmpeg.on('close', c => { ffmpegClosed = true; ffmpegCode = c; check(); });
  });

  return {
    pcmStream: ffmpeg.stdout,
    done,
    getFfmpegStderr: () => ffmpegStderr,
  };
}

export function parseLoudnessRangeLRA(ffmpegStderr) {
  // Match "LRA:         6.8 LU" but NOT "LRA low:" / "LRA high:" (those end in LUFS).
  const m = ffmpegStderr.match(/LRA:\s+(-?\d+(?:\.\d+)?)\s+LU(?!FS)/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}
