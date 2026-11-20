#!/usr/bin/env bash
# Entry point for the Windows scheduled task "kaf-song-analysis update"
# (docs/DEVELOPMENT.md, "Scheduled update"). The task starts WSL without a
# login shell, so PATH is set up here: nvm's node, and the user-installed
# yt-dlp in ~/.local/bin ahead of the apt one in /usr/bin, which is too old
# for YouTube. Output goes to a log only; nothing notifies.

export PATH="${PATH:-/usr/local/bin:/usr/bin:/bin}"
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
export PATH="$HOME/.local/bin:$PATH"

set -uo pipefail

LOG_DIR="$HOME/.local/state/kaf-song-analysis"
LOG="$LOG_DIR/update.log"
mkdir -p "$LOG_DIR"

# A run that is still going (slow download) makes the next one a no-op.
exec 9>"$LOG_DIR/update.lock"
flock -n 9 || exit 0

cd "$(dirname "$0")/.."
status=0
{
  echo "=== $(date -Iseconds) ==="
  node scripts/update.mjs || status=$?
  echo "exit=$status"
} >>"$LOG" 2>&1

# Keep the log bounded; decoding progress makes long lines.
tail -n 2000 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"

# Task Scheduler's "Last Run Result" shows this; it is the only signal besides the log.
exit "$status"
