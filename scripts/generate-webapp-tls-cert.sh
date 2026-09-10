#!/usr/bin/env bash
# Generate the certificate the webapp-tls front door serves.
#
# Why a certificate at all: the Re-write Practice voice input calls
# getUserMedia, which browsers expose only in a secure context. Over plain
# http the microphone cannot be opened by any means available to the
# application, so the dashboard is served over https as well.
#
# Why a local CA and a leaf, rather than one self-signed certificate:
#   - A bare self-signed certificate with an 825-day life made Chrome answer
#     ERR_CERT_INVALID, which — unlike ERR_CERT_AUTHORITY_INVALID — has NO
#     "proceed anyway" link. The site was simply unreachable. Chrome caps
#     certificate lifetime at 398 days and rejects, rather than warns about,
#     what exceeds it, so the leaf below is 397 days.
#   - With a CA of our own, the warning can also be removed entirely: import
#     _tls/ca.crt once into a tester's trust store and https just works, with
#     no interstitial to click.
#
# Why not a publicly trusted certificate: the host is reached at a private
# address (10.226.8.205) and no public CA issues certificates for private IP
# space. That needs a hostname under a domain the project controls.
#
# Output goes to _tls/ at the repo root, which is gitignored — the private
# keys must never enter the repository.
#
# Usage:
#   bash scripts/generate-webapp-tls-cert.sh [host-ip]
set -euo pipefail

HOST_IP="${1:-10.226.8.205}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/_tls"
# Chrome rejects anything over 398 days outright; stay under it.
LEAF_DAYS=397

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

# ── Local CA ────────────────────────────────────────────────────────────────
# Long-lived on purpose: testers who import it should not have to repeat that
# when the leaf is renewed.
openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout ca.key -out ca.crt \
  -subj "/CN=COMPASS Dashboard Local CA/O=COMPASS Dashboard" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

# ── Leaf for the host ───────────────────────────────────────────────────────
openssl req -nodes -newkey rsa:2048 \
  -keyout webapp.key -out webapp.csr \
  -subj "/CN=$HOST_IP"

# Modern browsers ignore the subject CN entirely and match on SAN only, so the
# addresses the dashboard is reached by all have to be listed here.
cat > webapp.ext <<EXT
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:$HOST_IP,IP:127.0.0.1,DNS:localhost
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
EXT

openssl x509 -req -in webapp.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out webapp.crt -days "$LEAF_DAYS" -sha256 -extfile webapp.ext

# nginx serves the chain in one file: leaf first, issuer after it.
cat webapp.crt ca.crt > webapp-fullchain.crt

rm -f webapp.csr webapp.ext

chmod 600 ca.key webapp.key
chmod 644 ca.crt webapp.crt webapp-fullchain.crt

echo
echo "Wrote $OUT_DIR/{ca.crt,webapp-fullchain.crt,webapp.key}"
openssl x509 -in webapp.crt -noout -subject -issuer -dates -ext subjectAltName
echo
echo "Reload the front door:"
echo "  docker compose -f docker-compose-frontend.yml up -d --force-recreate webapp-tls"
echo
echo "To remove the browser warning entirely, import _tls/ca.crt on the client"
echo "as a trusted root. Without that, https shows one bypassable warning."
