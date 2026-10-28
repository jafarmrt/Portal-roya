#!/usr/bin/env bash
# Keeps nginx from logging who sends a message to the suggestion boxes, or looks up an answer with a
# tracking code, so the access log cannot match an anonymous message to a computer. It also removes
# such lines already in the logs. Everything else is logged as before.
#
# Run it once as the user that runs the portal, without sudo; it asks for the sudo password itself.
# Running it again changes nothing. enable-https.sh runs it after it rewrites the site.
#
#   bash /opt/roya-portal/current/deploy/quiet-logs.sh
set -Eeuo pipefail

SITE="${NGINX_SITE:-/etc/nginx/sites-available/roya-portal}"
MAP_FILE="${NGINX_QUIET_MAP:-/etc/nginx/conf.d/roya-portal-quiet.conf}"
LOG_DIR="${NGINX_LOG_DIR:-/var/log/nginx}"
VAR='$roya_portal_loggable'
# Requests whose lines are left out, as "<method> <path>".
QUIET='^POST /api/suggestions(/track)?$'
# The same requests as they appear in existing access and error log lines.
QUIET_LINE='"POST /api/suggestions(/track)? HTTP'

log() { echo "[$(date '+%F %T')] $*"; }
die() { log "ERROR: $*"; exit 1; }

SUDO=sudo
[ "$(id -u)" -ne 0 ] || SUDO=
[ -f "$SITE" ] || die "$SITE not found. Set NGINX_SITE to the portal's nginx site file."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp "$SITE" "$TMP/site.before"
MAP_EXISTED=false
[ -f "$MAP_FILE" ] && MAP_EXISTED=true && cp "$MAP_FILE" "$TMP/map.before"

restore() {
  $SUDO install -m 644 "$TMP/site.before" "$SITE"
  if $MAP_EXISTED; then $SUDO install -m 644 "$TMP/map.before" "$MAP_FILE"; else $SUDO rm -f "$MAP_FILE"; fi
}

# Which requests are logged; nginx reads conf.d inside its http block.
cat >"$TMP/map" <<EOF
# Written by roya-portal deploy/quiet-logs.sh: who writes to the suggestion boxes is not logged.
map "\$request_method \$uri" $VAR {
    "~$QUIET" 0;
    default 1;
}
EOF
$SUDO install -m 644 "$TMP/map" "$MAP_FILE"

# Each server block of the portal's site logs through that map.
if grep -qF "if=$VAR" "$SITE"; then
  log "The portal's site already leaves these requests out of the log."
else
  awk -v line="access_log $LOG_DIR/access.log combined if=$VAR;" '
    { print }
    /^[[:space:]]*server_name[[:space:]]/ { match($0, /^[[:space:]]*/); print substr($0, 1, RLENGTH) line }
  ' "$SITE" >"$TMP/site"
  grep -qF "if=$VAR" "$TMP/site" || die "No server_name line found in $SITE; nothing was changed."
  $SUDO install -m 644 "$TMP/site" "$SITE"
fi

if ! $SUDO nginx -t >/dev/null 2>&1; then
  restore
  die "nginx did not accept the change, so the old settings were put back. Details: sudo nginx -t"
fi
$SUDO systemctl reload nginx
log "nginx no longer logs messages sent to the suggestion boxes or tracking-code lookups."

# Lines written before this change go too. Files are rewritten in place (same file, owner and rights),
# so nginx keeps writing to them.
removed=0
for f in "$LOG_DIR"/access.log* "$LOG_DIR"/error.log*; do
  [ -f "$f" ] || continue
  case "$f" in
    *.gz) reader=(zcat); writer=(gzip -c) ;;
    *) reader=(cat); writer=(cat) ;;
  esac
  count="$($SUDO "${reader[@]}" "$f" | grep -cE "$QUIET_LINE" || true)"
  [ "${count:-0}" -gt 0 ] || continue
  $SUDO "${reader[@]}" "$f" | grep -vE "$QUIET_LINE" | "${writer[@]}" >"$TMP/log" || true
  $SUDO sh -c 'cat "$1" > "$2"' sh "$TMP/log" "$f"
  removed=$((removed + count))
done
log "Removed $removed earlier log line(s) about the suggestion boxes."
