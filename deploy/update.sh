#!/usr/bin/env bash
# Updates the portal from GitHub and restarts it under PM2 (installs without Docker).
#
#   deploy/update.sh          update now to the latest main
#   deploy/update.sh --auto   for cron: update only when main has a new commit whose CI passed
#
# Before each update the database is backed up to backups/. If the build or the
# health check fails, the previous version is rebuilt and restarted.
set -Eeuo pipefail

BRANCH="${UPDATE_BRANCH:-main}"
REPO_SLUG="jafarmrt/Portal-roya"
APP_NAME="roya-portal"
KEEP_BACKUPS=10
MIN_FREE_MB=700

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# cron runs with a minimal PATH; pick up nvm or a global npm prefix if present.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null
fi

AUTO=false
[ "${1:-}" = "--auto" ] && AUTO=true

log() { echo "[$(date '+%F %T')] $*"; }
die() { log "ERROR: $*"; exit 1; }

# Only one update at a time.
mkdir -p logs backups
exec 9>"logs/.update.lock"
flock -n 9 || { log "Another update is running; skipping."; exit 0; }

env_value() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
[ -f .env ] || die ".env not found in $APP_DIR"
PORT="$(env_value PORT)"; PORT="${PORT:-3000}"
DATABASE_URL="$(env_value DATABASE_URL)"

[ -z "$(git status --porcelain --untracked-files=no)" ] || die "There are local changes to tracked files; commit or discard them first."

git fetch --quiet origin "$BRANCH"
CURRENT="$(git rev-parse HEAD)"
TARGET="$(git rev-parse "origin/$BRANCH")"

if [ "$CURRENT" = "$TARGET" ]; then
  $AUTO || log "Already up to date ($(git log -1 --format='%h %s'))."
  exit 0
fi

if $AUTO; then
  # Deploy only commits whose GitHub checks all passed.
  STATE="$(curl -fsS --max-time 20 "https://api.github.com/repos/$REPO_SLUG/commits/$TARGET/check-runs" \
    | node -e '
      let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const runs = JSON.parse(s).check_runs || [];
        if (runs.length === 0) return console.log("none");
        if (runs.some((r) => r.status !== "completed")) return console.log("pending");
        console.log(runs.every((r) => ["success", "skipped", "neutral"].includes(r.conclusion)) ? "success" : "failure");
      });' 2>/dev/null || echo "unknown")"
  case "$STATE" in
    success) ;;
    pending|none) exit 0 ;;   # try again on the next run
    *) log "Skipping ${TARGET:0:7}: CI state is '$STATE'."; exit 0 ;;
  esac
fi

FREE_MB="$(df -Pm "$APP_DIR" | awk 'NR==2 {print $4}')"
[ "$FREE_MB" -ge "$MIN_FREE_MB" ] || die "Only ${FREE_MB} MB free; at least ${MIN_FREE_MB} MB is needed to build."

log "Updating ${CURRENT:0:7} -> ${TARGET:0:7}"
git log --oneline "$CURRENT..$TARGET" | sed 's/^/    /'

BACKUP=""
if [ -n "$DATABASE_URL" ] && command -v pg_dump >/dev/null; then
  BACKUP="backups/db-$(date +%F-%H%M)-${CURRENT:0:7}.sql.gz"
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP"
  log "Database backed up to $BACKUP"
  ls -1t backups/db-*.sql.gz | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm --
else
  log "WARNING: pg_dump not available; skipping the database backup."
fi

# Every step returns explicitly: set -e does not apply inside a function called with ||.
build_and_restart() {
  npm ci --no-audit --no-fund --loglevel=error || return 1
  npm run build > logs/build.log 2>&1 || { tail -n 30 logs/build.log; return 1; }
  npm prune --omit=dev --no-audit --no-fund --loglevel=error || return 1
  npm cache clean --force --loglevel=error || true
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 reload "$APP_NAME" --update-env >/dev/null || return 1
  else
    pm2 start deploy/ecosystem.config.cjs >/dev/null || return 1
  fi
  pm2 save >/dev/null || true
  for _ in $(seq 1 30); do
    curl -fsS --max-time 2 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

rollback() {
  log "Update failed; restoring ${CURRENT:0:7}."
  git reset --quiet --hard "$CURRENT"
  if build_and_restart; then
    log "Previous version restored."
    [ -n "$BACKUP" ] && log "If the database schema had already changed, restore it with: gunzip -c $BACKUP | psql \"\$DATABASE_URL\""
  else
    log "ERROR: the previous version did not come back up either. Check: pm2 logs $APP_NAME"
  fi
  exit 1
}

git merge --quiet --ff-only "$TARGET" || die "Cannot fast-forward to origin/$BRANCH."
build_and_restart || rollback
log "Done: $(git log -1 --format='%h %s')"
