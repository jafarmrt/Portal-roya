#!/usr/bin/env bash
# Makes the portal's HTTPS certificate, signed by a small certificate authority (CA) of
# the company's own. Install the CA certificate (roya-ca.crt) on the staff computers once,
# for example with Group Policy, and browsers then trust the portal. See deploy/HTTPS.md.
#
#   sudo bash make-cert.sh 192.168.0.21                      the portal is opened by IP address
#   sudo bash make-cert.sh 192.168.0.21 portal.roya.local    ...and by a name in the internal DNS
#
# Run it again to renew the certificate (it lasts 825 days). The CA (10 years) is reused,
# so the computers need nothing new. Files go to $PORTAL_HOME/ssl (default /opt/roya-portal/ssl):
#   roya-ca.crt   the CA certificate, to install on the computers and phones
#   roya-ca.key   the CA's private key: keep it secret, ideally off the server (see deploy/HTTPS.md)
#   portal.crt    the portal certificate, for nginx
#   portal.key    its private key, readable by root only
set -Eeuo pipefail

PORTAL_HOME="${PORTAL_HOME:-/opt/roya-portal}"
SSL_DIR="${SSL_DIR:-$PORTAL_HOME/ssl}"
CA_DAYS=3650
CERT_DAYS=825 # the longest that Apple devices accept

die() { echo "ERROR: $*" >&2; exit 1; }

[ $# -ge 1 ] || die "Give the portal's IP address and/or host names, e.g.: sudo bash $0 192.168.0.21"
[ "$(id -u)" -eq 0 ] || die "Run it with sudo, so that only root can read the private keys."
command -v openssl >/dev/null || die "'openssl' is not installed."

names=()
for name in "$@"; do
  if [[ $name =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
    names+=("IP:$name")
  elif [[ $name =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
    names+=("DNS:$name")
  else
    die "'$name' is neither an IP address nor a host name."
  fi
done
san=$(IFS=,; echo "${names[*]}")

umask 077
mkdir -p "$SSL_DIR"
cd "$SSL_DIR"

if [ ! -f roya-ca.crt ]; then
  echo "Making the company CA (roya-ca.crt), valid for $((CA_DAYS / 365)) years..."
  openssl req -x509 -new -newkey rsa:4096 -nodes -sha256 -days "$CA_DAYS" \
    -keyout roya-ca.key -out roya-ca.crt -subj "/O=Roya/CN=Roya Portal CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
elif [ ! -f roya-ca.key ]; then
  die "roya-ca.key is not in $SSL_DIR. Copy back the CA key you kept aside (see deploy/HTTPS.md); a new CA would have to be installed on every computer again."
fi

echo "Making the portal certificate for: $*"
ext=$(mktemp)
trap 'rm -f "$ext" portal.csr' EXIT
cat >"$ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$san
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid
EOF
openssl req -new -newkey rsa:2048 -nodes -keyout portal.key.new -out portal.csr -subj "/O=Roya/CN=$1" 2>/dev/null
openssl x509 -req -in portal.csr -CA roya-ca.crt -CAkey roya-ca.key -CAcreateserial \
  -days "$CERT_DAYS" -sha256 -extfile "$ext" -out portal.crt.new 2>/dev/null
mv portal.key.new portal.key
mv portal.crt.new portal.crt

# The certificates are public; the keys stay root-only.
chmod 755 "$SSL_DIR"
chmod 644 roya-ca.crt portal.crt
chmod 600 roya-ca.key portal.key

openssl verify -CAfile roya-ca.crt portal.crt >/dev/null || die "The new certificate does not verify against the CA."
echo
echo "Done. Files in $SSL_DIR:"
echo "  roya-ca.crt  install on the computers (Group Policy) and phones"
echo "  portal.crt   valid until $(openssl x509 -enddate -noout -in portal.crt | cut -d= -f2), for: $san"
echo "  portal.key   for nginx"
echo
echo "If nginx already uses this certificate, load the new one with: sudo nginx -t && sudo systemctl reload nginx"
