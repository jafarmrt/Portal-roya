#!/usr/bin/env bash
# Puts the portal on HTTPS under an internal host name, next to any other site that nginx
# serves on ports 80 and 443 (each site answers to its own name, so the others are untouched).
# Run it as the user that runs the portal, without sudo; it asks for the sudo password itself.
#
#   enable-https.sh portal.royaco.com   switch the portal to https://portal.royaco.com
#   enable-https.sh --undo              go back to the nginx site and .env from before HTTPS
#
# First make the certificate with that name (sudo bash make-cert.sh 192.168.0.21 portal.royaco.com),
# have the name point to this server in the internal DNS, and install roya-ca.crt on the
# computers. Old addresses (http://<server>:8081 and http://<name>) are sent on to the new one.
# If the portal does not answer on the new address afterwards, the old settings come back.
# See deploy/HTTPS.md.
set -Eeuo pipefail

PORTAL_HOME="${PORTAL_HOME:-/opt/roya-portal}"
SITE="${NGINX_SITE:-/etc/nginx/sites-available/roya-portal}"
OLD_PORT="${OLD_PORT:-8081}" # where the portal was served over http; old links keep working
APP_NAME="roya-portal"
MARK="# Written by enable-https.sh"

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null
fi

log() { echo "[$(date '+%F %T')] $*"; }
die() { log "ERROR: $*"; exit 1; }

[ -z "${SUDO_USER:-}" ] || die "Run it without sudo, as the user that runs the portal: bash $0 ${1:-portal.royaco.com}"
SUDO=sudo
[ "$(id -u)" -ne 0 ] || SUDO=

cd "$PORTAL_HOME" 2>/dev/null || die "$PORTAL_HOME does not exist."
[ -w .env ] || die "$PORTAL_HOME/.env is missing or not writable by $(whoami)."
for cmd in curl openssl pm2; do command -v "$cmd" >/dev/null || die "'$cmd' is not installed."; done
[ -f "$SITE" ] || die "$SITE not found. Set NGINX_SITE to the portal's nginx site file."
[ -e "/etc/nginx/sites-enabled/$(basename "$SITE")" ] || die "$SITE is not enabled in /etc/nginx/sites-enabled."

env_value() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
set_env() {
  if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >>.env; fi
}
PORT="$(env_value PORT)"; PORT="${PORT:-3000}"

BACKUPS="$PORTAL_HOME/backups/https"
SITE_BACKUP="$BACKUPS/nginx-site.before-https"
ENV_BACKUP="$BACKUPS/env.before-https"

reload_nginx() { $SUDO nginx -t 2>&1 | tail -n 2 && $SUDO systemctl reload nginx; }

restart_portal() {
  pm2 restart "$APP_NAME" >/dev/null || return 1
  for _ in $(seq 1 30); do
    curl -fsS --noproxy "*" --max-time 2 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

undo() {
  [ -f "$SITE_BACKUP" ] && [ -f "$ENV_BACKUP" ] || die "No backup from before HTTPS in $BACKUPS."
  log "Putting back the nginx site and .env from before HTTPS..."
  $SUDO install -m 644 "$SITE_BACKUP" "$SITE"
  install -m 600 "$ENV_BACKUP" .env
  reload_nginx || die "nginx did not accept the old site file; it is in $SITE."
  restart_portal || die "The portal did not start again; see: pm2 logs $APP_NAME"
  log "Done. The portal is back on its old address: $(env_value APP_URL)"
}

if [ "${1:-}" = "--undo" ]; then
  undo
  exit 0
fi

NAME="${1:-}"
[[ $NAME =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]] ||
  die "Give the portal's host name, e.g.: bash $0 portal.royaco.com"

CERT="$PORTAL_HOME/ssl/portal.crt"
KEY="$PORTAL_HOME/ssl/portal.key"
CA="$PORTAL_HOME/ssl/roya-ca.crt"
[ -f "$CERT" ] && $SUDO test -f "$KEY" || die "No certificate in $PORTAL_HOME/ssl. Make it first: sudo bash $(dirname "$0")/make-cert.sh <server IP> $NAME"
openssl x509 -in "$CERT" -noout -checkhost "$NAME" | grep -q "does match" ||
  die "The certificate is not for $NAME. Make it again with the name: sudo bash $(dirname "$0")/make-cert.sh <server IP> $NAME"
openssl x509 -in "$CERT" -noout -checkend 86400 >/dev/null || die "The certificate has expired. Renew it with make-cert.sh."
curl -fsS --noproxy "*" --max-time 3 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 || die "The portal is not answering on port $PORT; start it first (pm2 status)."

# The computers find the name through the internal DNS; this server may use another DNS, so only warn.
resolved="$(getent hosts "$NAME" | awk '{print $1}' | head -n1 || true)"
if [ -z "$resolved" ]; then
  log "Note: this server cannot look up $NAME. That is fine if the computers can (check with: ping $NAME)."
elif ! hostname -I | tr ' ' '\n' | grep -qx "$resolved"; then
  log "WARNING: $NAME points to $resolved, which is not this server ($(hostname -I | xargs))."
fi

# Keep the settings from before HTTPS once, so that --undo always goes back to them.
if ! grep -qF "$MARK" "$SITE"; then
  mkdir -p "$BACKUPS"
  cp "$SITE" "$SITE_BACKUP"
  install -m 600 .env "$ENV_BACKUP"
  log "Saved the current nginx site and .env in $BACKUPS"
fi
[ -f "$SITE_BACKUP" ] || die "No backup of the old nginx site in $BACKUPS."

MAX_BODY="$(grep -oE 'client_max_body_size +[0-9]+[kKmMgG]?' "$SITE_BACKUP" | head -n1 | awk '{print $2}')"
NEW_SITE="$(mktemp)"
trap 'rm -f "$NEW_SITE"' EXIT
cat >"$NEW_SITE" <<EOF
$MARK: the portal at https://$NAME
# Undo: bash $PORTAL_HOME/current/deploy/enable-https.sh --undo

# Old addresses go to the new one.
server {
    listen 80;
    server_name $NAME;
    return 301 https://$NAME\$request_uri;
}

server {
    listen $OLD_PORT;
    server_name _;
    return 301 https://$NAME\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $NAME;

    ssl_certificate     $CERT;
    ssl_certificate_key $KEY;

    client_max_body_size ${MAX_BODY:-25m};   # keep >= MAX_UPLOAD_MB

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Live updates (Server-Sent Events) must not be buffered.
    location /api/events {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
}
EOF

log "Writing $SITE for https://$NAME ..."
$SUDO install -m 644 "$NEW_SITE" "$SITE"
if ! reload_nginx; then
  $SUDO install -m 644 "$SITE_BACKUP" "$SITE"
  die "nginx did not accept the new settings, so the old ones were put back. Nothing has changed."
fi

log "Setting APP_URL, COOKIE_SECURE and TRUST_PROXY in .env and restarting the portal..."
set_env APP_URL "https://$NAME"
set_env COOKIE_SECURE true
set_env TRUST_PROXY true
restart_portal || { undo; die "The portal did not start with the new settings, so the old ones were put back."; }

CHECK=(curl -fsS --noproxy "*" --max-time 5 --resolve "$NAME:443:127.0.0.1")
if [ -f "$CA" ]; then CHECK+=(--cacert "$CA"); else CHECK+=(-k); fi
if ! "${CHECK[@]}" "https://$NAME/healthz" >/dev/null; then
  undo
  die "The portal did not answer on https://$NAME, so the old settings were put back."
fi
redirect="$(curl -s --noproxy "*" -o /dev/null --max-time 5 -w '%{redirect_url}' "http://127.0.0.1:$OLD_PORT/")"
[ "$redirect" = "https://$NAME/" ] || log "WARNING: the old address on port $OLD_PORT does not redirect as expected ($redirect)."

log "Done. The portal is at https://$NAME"
log "Old links (http://...:$OLD_PORT and http://$NAME) now go there too."
log "To go back: bash $PORTAL_HOME/current/deploy/enable-https.sh --undo"
