#!/usr/bin/env bash
# Installs or updates the portal from the ready-made build that GitHub publishes for
# every commit on main whose tests passed. No git, npm or node_modules on the server.
#
#   update.sh          install or update to the latest build now
#   update.sh --auto   for cron: same, but silent when there is nothing new
#   update.sh --version  show which version is installed and running, then exit
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
SHOW_VERSION=false
case "${1:-}" in
  --auto) AUTO=true ;;
  --version) SHOW_VERSION=true ;;
esac

log() { echo "[$(date '+%F %T')] $*"; }
die() { log "ERROR: $*"; exit 1; }

cd "$PORTAL_HOME" 2>/dev/null || die "$PORTAL_HOME does not exist. Create it first (see deploy/INSTALL-PM2.md)."
[ -f .env ] || die "$PORTAL_HOME/.env not found. Create it first (see deploy/INSTALL-PM2.md)."
for cmd in curl tar node pm2; do command -v "$cmd" >/dev/null || die "'$cmd' is not installed."; done
mkdir -p releases uploads backups logs

# Only one update at a time (--version only reads, so it never waits).
if ! $SHOW_VERSION; then
  exec 9>"logs/.update.lock"
  flock -n 9 || { log "Another update is running; skipping."; exit 0; }
fi

# "2.20.0 (build-57)" for an installed release folder; older releases have no build-info.json.
version_of() {
  [ -n "${1:-}" ] && [ -d "releases/$1" ] || return 0
  node -e '
    const fs = require("fs"), dir = process.argv[1];
    let v = "";
    try { v = JSON.parse(fs.readFileSync(dir + "/build-info.json", "utf8")).version; } catch {}
    if (!v) try { v = JSON.parse(fs.readFileSync(dir + "/package.json", "utf8")).version; } catch {}
    process.stdout.write(v ? "v" + v : "");' "releases/$1" 2>/dev/null || true
}
describe() { local v; v="$(version_of "$1")"; echo "${v:+$v }($1)"; }

# Section titles of CHANGELOG.md in the new release that are newer than the old version.
whats_new() {
  [ -f "releases/$1/CHANGELOG.md" ] || return 0
  node -e '
    const [file, old] = process.argv.slice(1);
    const num = (v) => v.replace(/^v/, "").split(".").map(Number);
    const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
    let version = null, shown = 0;
    for (const line of require("fs").readFileSync(file, "utf8").split(/\r?\n/)) {
      const h = /^## \[([^\]]+)\]/.exec(line);
      if (h) { version = old && !newer(h[1], old) ? null : h[1]; if (!version || ++shown > 10) break; continue; }
      if (version && line.startsWith("### ")) console.log("  v" + version + ": " + line.slice(4));
    }' "releases/$1/CHANGELOG.md" "${2:-}" 2>/dev/null || true
}

# Empty when .env does not set it (grep finding nothing must not stop the script under pipefail).
env_value() { { grep -E "^$1=" .env || true; } | tail -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
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
if $SHOW_VERSION; then
  RUNNING="$(curl -fsS --max-time 3 "http://127.0.0.1:$PORT/healthz" 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { const h = JSON.parse(s); if (h.version) console.log("v" + h.version + (h.build ? " (" + h.build + ")" : "")); } catch {}
    });' || true)"
  if [ -n "$CURRENT_TAG" ]; then log "Installed: $(describe "$CURRENT_TAG")"; else log "Installed: nothing yet"; fi
  log "Running:   ${RUNNING:-not responding on port $PORT}"
  [ "$TAG" = "$CURRENT_TAG" ] && log "This is the latest build." || log "Newer build on GitHub: $TAG (run update.sh to install it)."
  exit 0
fi
if [ "$TAG" = "$CURRENT_TAG" ]; then
  $AUTO || log "Already up to date: $(describe "$TAG")."
  exit 0
fi

# A build that already failed here is not retried by cron; run update.sh by hand to retry.
if $AUTO && [ -f "logs/.failed-$TAG" ]; then
  exit 0
fi

# The server has little disk and PostgreSQL stops when it is full, so an update needs some room
# (download, unpacked release, database backup) and must not take the last of it.
FREE_MB="$(df -Pm . | awk 'NR==2 {print $4}')"
if [ -n "$FREE_MB" ] && [ "$FREE_MB" -lt "${MIN_FREE_MB:-400}" ]; then
  die "Only ${FREE_MB} MB of disk space is free; at least ${MIN_FREE_MB:-400} MB is needed. Nothing was changed. Free some space (e.g. old files in $PORTAL_HOME/backups) and run update.sh again."
fi

log "Downloading $TAG${CURRENT_TAG:+ (installed now: $(describe "$CURRENT_TAG"))}"
TMP="releases/.$TAG.tar.gz"
curl -fsSL --retry 3 --max-time 600 -o "$TMP" "$URL" || die "Download failed."
rm -rf "releases/$TAG" && mkdir -p "releases/$TAG"
tar -xzf "$TMP" -C "releases/$TAG" || { rm -rf "releases/$TAG" "$TMP"; die "The downloaded file is damaged."; }
rm -f "$TMP"
touch "releases/$TAG"   # pruning below keeps the newest by time
[ -f "releases/$TAG/server-dist/index.cjs" ] || die "The release does not contain the server."
OLD_VERSION="$(version_of "$CURRENT_TAG")"
NEW_VERSION="$(version_of "$TAG")"
log "Updating ${CURRENT_TAG:+$(describe "$CURRENT_TAG") }-> $(describe "$TAG")"

BACKUP=""
if [ -n "$CURRENT_TAG" ] && [ -n "$DATABASE_URL" ] && command -v pg_dump >/dev/null; then
  BACKUP="backups/db-$(date +%F-%H%M)-$CURRENT_TAG.sql.gz"
  # --clean lets the restore command below run over the existing database.
  if ! pg_dump --clean --if-exists "$DATABASE_URL" | gzip > "$BACKUP.partial"; then
    rm -f "$BACKUP.partial"
    die "The database backup failed (is the disk full?). Nothing was changed; the current version keeps running."
  fi
  mv -f "$BACKUP.partial" "$BACKUP"
  log "Database backed up to $BACKUP"
  ls -1t backups/db-*.sql.gz | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm --
fi

# pm2 is run without the lock's file descriptor (9>&-): when it has to start its background daemon
# (e.g. after a reboot), the daemon would otherwise keep the lock, and every later update would
# report "Another update is running" and do nothing.
switch_to() {
  ln -sfn "releases/$1" current.tmp && mv -T current.tmp current
  if pm2 describe "$APP_NAME" >/dev/null 2>&1 9>&-; then
    pm2 delete "$APP_NAME" >/dev/null 9>&-
  fi
  pm2 start "releases/$1/deploy/ecosystem.config.cjs" >/dev/null 9>&- || return 1
  pm2 save >/dev/null 9>&- || true
  for _ in $(seq 1 30); do
    curl -fsS --max-time 2 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

if switch_to "$TAG"; then
  log "Done: $(describe "$TAG") is running on port $PORT."
  if [ -n "$NEW_VERSION" ] && [ "$NEW_VERSION" != "$OLD_VERSION" ]; then
    CHANGES="$(whats_new "$TAG" "$OLD_VERSION")"
    [ -n "$CHANGES" ] && { log "What's new since ${OLD_VERSION:-the previous build} (full list: footer of the portal):"; echo "$CHANGES"; }
  fi
  rm -f logs/.failed-*
  # A copy kept outside the releases (e.g. /tmp/update.sh) is kept in step with the release, so the
  # next run uses the newest version of it. current/deploy/update.sh already is.
  SELF="$(readlink -f "$0" 2>/dev/null || true)"
  NEW_SCRIPT="releases/$TAG/deploy/update.sh"
  if [ -f "$SELF" ] && [[ "$SELF" != "$(pwd -P)/releases/"* ]] && [ -f "$NEW_SCRIPT" ] && ! cmp -s "$NEW_SCRIPT" "$SELF" && [ -w "$(dirname "$SELF")" ]; then
    cp "$NEW_SCRIPT" "$SELF.new" && chmod +x "$SELF.new" && mv -f "$SELF.new" "$SELF" && log "update.sh itself was updated ($SELF)."
  fi
  # Keep the newest few releases for quick rollback.
  ls -1dt releases/*/ | { grep -v "^releases/$TAG/$" || true; } | tail -n +$KEEP_RELEASES | xargs -r rm -rf --
  exit 0
fi

touch "logs/.failed-$TAG"
log "The new version did not start. Recent log:"
pm2 logs "$APP_NAME" --lines 20 --nostream 2>/dev/null | tail -n 20 || true
if [ -n "$CURRENT_TAG" ] && switch_to "$CURRENT_TAG"; then
  log "Previous version $(describe "$CURRENT_TAG") restored."
  [ -n "$BACKUP" ] && log "If the database schema had already changed, restore it with: gunzip -c $BACKUP | psql \"\$DATABASE_URL\""
fi
exit 1
