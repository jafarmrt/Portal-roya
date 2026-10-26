#!/usr/bin/env bash
# Installs or updates the portal from the ready-made build that GitHub publishes for
# every commit on main whose tests passed. No git, npm or node_modules on the server.
#
#   update.sh          install or update to the latest build now
#   update.sh --auto   for cron: same, but silent when there is nothing new
#
# Layout under PORTAL_HOME (default /opt/roya-portal):
#   .env  uploads/  backups/  logs/  releases/<tag>/  current -> releases/<tag>
# Before each update the database is backed up. If the new version does not pass
# the health check, the previous version is started again.
set -Eeuo pipefail

REPO_SLUG="${PORTAL_REPO:-jafarmrt/Portal-roya}"
PORTAL_HOME="${PORTAL_HOME:-/opt/roya-portal}"
APP_NAME="roya-portal"
ASSET="roya-portal.tar.gz"
RELEASE_API="${PORTAL_RELEASE_API:-https://api.github.com/repos/$REPO_SLUG/releases/latest}"
KEEP_RELEASES=3
KEEP_BACKUPS=10

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

cd "$PORTAL_HOME" 2>/dev/null || die "$PORTAL_HOME does not exist. Create it first (see deploy/INSTALL-PM2.md)."
[ -f .env ] || die "$PORTAL_HOME/.env not found. Create it first (see deploy/INSTALL-PM2.md)."
for cmd in curl tar node pm2; do command -v "$cmd" >/dev/null || die "'$cmd' is not installed."; done
mkdir -p releases uploads backups logs

# Only one update at a time.
exec 9>"logs/.update.lock"
flock -n 9 || { log "Another update is running; skipping."; exit 0; }

env_value() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
PORT="$(env_value PORT)"; PORT="${PORT:-3000}"
DATABASE_URL="$(env_value DATABASE_URL)"

# Latest published build: its tag and download address.
read -r TAG URL < <(curl -fsSL --max-time 30 "$RELEASE_API" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const r = JSON.parse(s);
    const a = (r.assets || []).find((x) => x.name === process.argv[1]);
    if (r.tag_name && a) console.log(r.tag_name, a.browser_download_url);
  });' "$ASSET") || true
[ -n "${TAG:-}" ] || die "Could not read the latest release from GitHub."

CURRENT_TAG=""
[ -L current ] && CURRENT_TAG="$(basename "$(readlink current)")"
if [ "$TAG" = "$CURRENT_TAG" ]; then
  $AUTO || log "Already up to date ($TAG)."
  exit 0
fi

# A build that already failed here is not retried by cron; run update.sh by hand to retry.
if $AUTO && [ -f "logs/.failed-$TAG" ]; then
  exit 0
fi

log "Installing $TAG${CURRENT_TAG:+ (current: $CURRENT_TAG)}"
TMP="releases/.$TAG.tar.gz"
curl -fsSL --retry 3 --max-time 600 -o "$TMP" "$URL" || die "Download failed."
rm -rf "releases/$TAG" && mkdir -p "releases/$TAG"
tar -xzf "$TMP" -C "releases/$TAG" || { rm -rf "releases/$TAG" "$TMP"; die "The downloaded file is damaged."; }
rm -f "$TMP"
touch "releases/$TAG"   # pruning below keeps the newest by time
[ -f "releases/$TAG/server-dist/index.cjs" ] || die "The release does not contain the server."

BACKUP=""
if [ -n "$CURRENT_TAG" ] && [ -n "$DATABASE_URL" ] && command -v pg_dump >/dev/null; then
  BACKUP="backups/db-$(date +%F-%H%M)-$CURRENT_TAG.sql.gz"
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP"
  log "Database backed up to $BACKUP"
  ls -1t backups/db-*.sql.gz | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm --
fi

switch_to() {
  ln -sfn "releases/$1" current.tmp && mv -T current.tmp current
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 delete "$APP_NAME" >/dev/null
  fi
  pm2 start "releases/$1/deploy/ecosystem.config.cjs" >/dev/null || return 1
  pm2 save >/dev/null || true
  for _ in $(seq 1 30); do
    curl -fsS --max-time 2 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

if switch_to "$TAG"; then
  log "Done: $TAG is running on port $PORT."
  rm -f logs/.failed-*
  # Keep the newest few releases for quick rollback.
  ls -1dt releases/*/ | { grep -v "^releases/$TAG/$" || true; } | tail -n +$KEEP_RELEASES | xargs -r rm -rf --
  exit 0
fi

touch "logs/.failed-$TAG"
log "The new version did not start. Recent log:"
pm2 logs "$APP_NAME" --lines 20 --nostream 2>/dev/null | tail -n 20 || true
if [ -n "$CURRENT_TAG" ] && switch_to "$CURRENT_TAG"; then
  log "Previous version $CURRENT_TAG restored."
  [ -n "$BACKUP" ] && log "If the database schema had already changed, restore it with: gunzip -c $BACKUP | psql \"\$DATABASE_URL\""
fi
exit 1
