#!/usr/bin/env bash
# Puts the portal on HTTPS under a host name, next to any other site that nginx serves on
# ports 80 and 443 (each site answers to its own name, so the others are untouched).
# Run it as the user that runs the portal, without sudo; it asks for the sudo password itself.
#
#   enable-https.sh portal.royaco.com --public   the portal is also opened from the internet:
#                                       a free Let's Encrypt certificate, renewed automatically
#   enable-https.sh portal.royaco.com   only inside the company: the certificate from make-cert.sh
#                                       (sudo bash make-cert.sh 192.168.0.21 portal.royaco.com),
#                                       with roya-ca.crt installed on the computers
#   enable-https.sh portal.royaco.com --force   (inside only) switch even though this server's DNS
#                                       does not point the name here (only if the computers' DNS does)
#   enable-https.sh --undo              go back to the nginx site and .env from before HTTPS
#
# Old addresses (http://<server>:8081 and http://<name>) are sent on to the new one. If the
# portal does not answer on the new address afterwards, the old settings come back.
# See deploy/HTTPS.md.
set -Eeuo pipefail

PORTAL_HOME="${PORTAL_HOME:-/opt/roya-portal}"
SITE="${NGINX_SITE:-/etc/nginx/sites-available/roya-portal}"
OLD_PORT="${OLD_PORT:-8081}" # where the portal was served over http; old links keep working
ACME_ROOT="${ACME_ROOT:-/var/www/letsencrypt}" # where certbot leaves the files Let's Encrypt asks for
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
FORCE=false
PUBLIC=false
for opt in "${@:2}"; do
  case "$opt" in
    --force) FORCE=true ;;
    --public) PUBLIC=true ;;
    *) die "Unknown option: $opt" ;;
  esac
done
[[ $NAME =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]] ||
  die "Give the portal's host name, e.g.: bash $0 portal.royaco.com --public"
curl -fsS --noproxy "*" --max-time 3 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 || die "The portal is not answering on port $PORT; start it first (pm2 status)."

CA="$PORTAL_HOME/ssl/roya-ca.crt"
if $PUBLIC; then
  CERT="/etc/letsencrypt/live/$NAME/fullchain.pem"
  KEY="/etc/letsencrypt/live/$NAME/privkey.pem"
  getent hosts "$NAME" >/dev/null || die "$NAME is not in the DNS yet; it has to point to the company's internet address."
else
  CERT="$PORTAL_HOME/ssl/portal.crt"
  KEY="$PORTAL_HOME/ssl/portal.key"
  [ -f "$CERT" ] && $SUDO test -f "$KEY" || die "No certificate in $PORTAL_HOME/ssl. Make it first: sudo bash $(dirname "$0")/make-cert.sh <server IP> $NAME"
  openssl x509 -in "$CERT" -noout -checkhost "$NAME" | grep -q "does match" ||
    die "The certificate is not for $NAME. Make it again with the name: sudo bash $(dirname "$0")/make-cert.sh <server IP> $NAME"
  openssl x509 -in "$CERT" -noout -checkend 86400 >/dev/null || die "The certificate has expired. Renew it with make-cert.sh."

  # Old links are sent to the new name, so switching before the DNS points it here would take the
  # portal away from everyone. This server normally asks the same DNS as the computers.
  resolved="$(getent hosts "$NAME" | awk '{print $1}' | head -n1 || true)"
  here="$(hostname -I | xargs)"
  if [ -z "$resolved" ] || ! tr ' ' '\n' <<<"$here" | grep -qx "$resolved"; then
    found="${resolved:-nothing}"
    if $FORCE; then
      log "WARNING: $NAME points to $found here, not to this server ($here); going on because of --force."
    else
      die "$NAME points to $found, not to this server ($here), so nothing was changed. If that is the company's internet address and the router sends it on to this server, run again with --public instead. Otherwise ask IT to point $NAME to this server in the internal DNS, then check on a computer with: ping $NAME. If the computers already reach this server by that name and only this server's DNS differs, run again with --force."
    fi
  fi
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
SITE_NOW="$(mktemp)"
trap 'rm -f "$NEW_SITE" "$SITE_NOW"' EXIT

# Port 80 under the name: Let's Encrypt's checks are answered, everything else goes on to https.
port80_server() {
  cat <<EOF
server {
    listen 80;
    server_name $NAME;

    location /.well-known/acme-challenge/ {
        root $ACME_ROOT;
    }
    location / {
        return 301 https://$NAME\$request_uri;
    }
}
EOF
}

# The whole site, with the given certificate and key.
write_site() {
  cat <<EOF
$MARK: the portal at https://$NAME
# Undo: bash $PORTAL_HOME/current/deploy/enable-https.sh --undo

# Old addresses go to the new one.
$(port80_server)

server {
    listen $OLD_PORT;
    server_name _;
    return 301 https://$NAME\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $NAME;

    ssl_certificate     $1;
    ssl_certificate_key $2;

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
}

if $PUBLIC && ! $SUDO test -f "$CERT"; then
  if ! command -v certbot >/dev/null; then
    log "Installing certbot, which gets the certificate from Let's Encrypt and renews it..."
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -q certbot >/dev/null ||
      { $SUDO apt-get update -q >/dev/null && $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -q certbot >/dev/null; } ||
      die "certbot could not be installed. Try: sudo apt-get install certbot"
  fi
  $SUDO mkdir -p "$ACME_ROOT"

  # Let's Encrypt first opens http://<name>/.well-known/acme-challenge/..., so nginx has to answer
  # there before the certificate exists. Apart from that, the portal stays as it is for now.
  cp "$SITE" "$SITE_NOW"
  if grep -qF "$MARK" "$SITE"; then
    cur_cert="$(grep -m1 -oE 'ssl_certificate +[^;]+' "$SITE" | awk '{print $2}')"
    cur_key="$(grep -m1 -oE 'ssl_certificate_key +[^;]+' "$SITE" | awk '{print $2}')"
    write_site "$cur_cert" "$cur_key" >"$NEW_SITE"
  else
    { cat "$SITE_BACKUP"; echo; port80_server; } >"$NEW_SITE"
  fi
  $SUDO install -m 644 "$NEW_SITE" "$SITE"
  if ! reload_nginx; then
    $SUDO install -m 644 "$SITE_NOW" "$SITE"
    reload_nginx >/dev/null || true
    die "nginx did not accept the settings for Let's Encrypt, so the old ones were put back. Nothing has changed."
  fi

  log "Asking Let's Encrypt for a certificate for $NAME ..."
  if ! $SUDO certbot certonly --webroot -w "$ACME_ROOT" -d "$NAME" --cert-name "$NAME" \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --deploy-hook "systemctl reload nginx"; then
    $SUDO install -m 644 "$SITE_NOW" "$SITE"
    reload_nginx >/dev/null || true
    die "Let's Encrypt gave no certificate, so nothing was changed. It has to open http://$NAME from the internet: $NAME must point to the company's internet address, and the router must send ports 80 and 443 on to this server. Check on a phone without Wi-Fi that http://$NAME opens."
  fi
fi
if $PUBLIC; then
  $SUDO openssl x509 -in "$CERT" -noout -checkend 86400 >/dev/null ||
    die "The Let's Encrypt certificate for $NAME has expired. Renew it with: sudo certbot renew"
fi

write_site "$CERT" "$KEY" >"$NEW_SITE"
log "Writing $SITE for https://$NAME ..."
$SUDO install -m 644 "$NEW_SITE" "$SITE"
if ! reload_nginx; then
  $SUDO install -m 644 "$SITE_BACKUP" "$SITE"
  reload_nginx >/dev/null || true
  die "nginx did not accept the new settings, so the settings from before HTTPS were put back."
fi

log "Setting APP_URL, COOKIE_SECURE and TRUST_PROXY in .env and restarting the portal..."
set_env APP_URL "https://$NAME"
set_env COOKIE_SECURE true
set_env TRUST_PROXY true
restart_portal || { undo; die "The portal did not start with the new settings, so the old ones were put back."; }

CHECK=(curl -fsS --noproxy "*" --max-time 5 --resolve "$NAME:443:127.0.0.1")
if $PUBLIC; then :; elif [ -f "$CA" ]; then CHECK+=(--cacert "$CA"); else CHECK+=(-k); fi
if ! "${CHECK[@]}" "https://$NAME/healthz" >/dev/null; then
  undo
  die "The portal did not answer on https://$NAME, so the old settings were put back."
fi
redirect="$(curl -s --noproxy "*" -o /dev/null --max-time 5 -w '%{redirect_url}' "http://127.0.0.1:$OLD_PORT/")"
[ "$redirect" = "https://$NAME/" ] || log "WARNING: the old address on port $OLD_PORT does not redirect as expected ($redirect)."

log "Done. The portal is at https://$NAME"
log "Old links (http://...:$OLD_PORT and http://$NAME) now go there too."
if $PUBLIC; then
  log "The certificate renews itself (certbot, twice a day it checks; it lasts 90 days)."
fi
log "To go back: bash $PORTAL_HOME/current/deploy/enable-https.sh --undo"
