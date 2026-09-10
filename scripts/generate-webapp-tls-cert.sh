#!/usr/bin/env bash
# Generate the self-signed certificate the webapp-tls front door serves.
#
# Why a certificate at all: the Re-write Practice voice input calls
# getUserMedia, which browsers expose only in a secure context. Over plain
# http:// the microphone cannot be opened by any means available to the
# application, so the dashboard is served over https:// as well.
#
# Why self-signed: the host is reached at a private address (10.226.8.205),
# and no public CA issues certificates for private IP space. The consequence
# is a one-time "not private" warning per browser; clicking through gives a
# full secure context, which is all the microphone needs.
#
# Output goes to _tls/ at the repo root, which is gitignored — the private key
# must never enter the repository.
#
# Usage:
#   bash scripts/generate-webapp-tls-cert.sh [host-ip]
set -euo pipefail

HOST_IP="${1:-10.226.8.205}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/_tls"

mkdir -p "$OUT_DIR"

openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout "$OUT_DIR/webapp.key" \
  -out "$OUT_DIR/webapp.crt" \
  -subj "/CN=$HOST_IP" \
  -addext "subjectAltName=IP:$HOST_IP,IP:127.0.0.1,DNS:localhost" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"

# The key is readable by the nginx container through a read-only bind mount;
# it never needs to be world-readable on the host.
chmod 600 "$OUT_DIR/webapp.key"
chmod 644 "$OUT_DIR/webapp.crt"

echo
echo "Wrote $OUT_DIR/webapp.crt and $OUT_DIR/webapp.key"
openssl x509 -in "$OUT_DIR/webapp.crt" -noout -subject -dates -ext subjectAltName
echo
echo "Start the front door with:"
echo "  docker compose -f docker-compose-frontend.yml up -d --no-deps webapp-tls"
echo "Then open:  https://$HOST_IP:3443/"
