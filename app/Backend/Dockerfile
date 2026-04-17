# ========= Stage 1: Build dependencies =========
FROM python:3.10-slim AS builder

WORKDIR /build

COPY requirements.txt .
RUN python -m pip install --upgrade pip \
 && pip install --no-cache-dir --prefix=/install -r requirements.txt \
 && pip install --no-cache-dir --prefix=/install 'uvicorn[standard]'


# ========= Stage 2: Runtime =========
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive \
    APP_MODULE=main:app \
    WEB_CONCURRENCY=3 \
    GUNICORN_TIMEOUT=60 \
    PORT=8000 \
    FORWARDED_ALLOW_IPS="172.16.0.0/12,10.0.0.0/8,192.168.0.0/16" \
    MALLOC_ARENA_MAX=2 \
    TZ=UTC

WORKDIR /app

# ── R + stringi for sentence segmentation (rpy2/stringi) ─────────────────────
# CRITICAL: stringi MUST use bundled ICU, NOT the system ICU.
#   --disable-pkg-config  → forces stringi to use its bundled ICU (74.1)
#                           instead of the system libicu (varies by OS/Debian version).
#   Without this flag, different OS versions produce different sentence counts
#   for the same input (e.g., SID 14: ICU 76.1→423 sentences vs ICU 74.1→424).
#   See: https://stringi.gagolewski.com/install.html
#
# DO NOT REMOVE --disable-pkg-config or change stringi version without
# verifying that sentence counts match the reference R pipeline output.
# ─────────────────────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl tini libpq5 \
    r-base r-base-dev libicu-dev gcc g++ \
 && R -e "install.packages('https://cloud.r-project.org/src/contrib/Archive/stringi/stringi_1.8.4.tar.gz', repos=NULL, type='source', quiet=TRUE, configure.args='--disable-pkg-config --disable-cxx11')" \
 && pip install --no-cache-dir rpy2==3.5.11 \
 && apt-get purge -y --auto-remove r-base-dev gcc g++ \
 && rm -rf /var/lib/apt/lists/*

# Copy pre-built Python packages from builder (no build tools in final image)
COPY --from=builder /install /usr/local

# App code (non-root)
RUN useradd -m appuser
COPY --chown=appuser:appuser . /app

# Writable dirs
RUN mkdir -p /app/logs /app/uploads /app/data /app/static \
 && chown -R appuser:appuser /app

USER appuser
EXPOSE ${PORT}

# prestart hook (DB init → Alembic → pipeline)
ENV PRE_START_PATH=/app/prestart.sh
RUN printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -e' \
  '' \
  '# Verify R stringi uses bundled ICU 74.1 (not system ICU)' \
  '# If this fails, sentence segmentation results will differ from the reference pipeline.' \
  'R -e "library(stringi); v <- stri_info()\$ICU.version; if (v != \"74.1\") stop(paste(\"Expected ICU 74.1, got\", v))" || { echo "[FATAL] ICU version mismatch — see Dockerfile comments"; exit 1; }' \
  '' \
  '# Wait for database' \
  '[ -f /app/wait_for_db.py ] && python /app/wait_for_db.py || true' \
  '' \
  '# Create tables (idempotent)' \
  '[ -f /app/init_db.py ] && python /app/init_db.py || true' \
  '' \
  '# Run Alembic migrations' \
  'if [ -f /app/alembic.ini ]; then' \
  '  alembic stamp head 2>/dev/null || true' \
  '  alembic upgrade head || true' \
  'fi' \
  '' \
  '# Run full pipeline on real transcripts (skip if no transcript dir or DB already has data)' \
  'if [ -d /app/data/transcripts ] && [ "$(ls /app/data/transcripts/*.xlsx 2>/dev/null | head -1)" ]; then' \
  '  python /app/pipeline_runner.py --dir /app/data/transcripts || true' \
  'fi' \
  > /app/prestart.sh \
 && chmod +x /app/prestart.sh

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl --silent --show-error --fail http://localhost:${PORT}/health || exit 1

# tini as PID 1
ENTRYPOINT ["/usr/bin/tini","--"]

# DB pool tuning
ENV DATABASE_POOL_SIZE=10 \
    DATABASE_MAX_OVERFLOW=20 \
    DATABASE_POOL_TIMEOUT=30

ENV RUN_ENV=prod

CMD ["/bin/bash","-lc","\
  : \"${WEB_CONCURRENCY:=$(( 2 * $(getconf _NPROCESSORS_ONLN) + 1 ))}\"; \
  ulimit -n 1048576 >/dev/null 2>&1 || true; \
  $PRE_START_PATH && \
  if [ \"$RUN_ENV\" = \"dev\" ]; then \
    exec uvicorn ${APP_MODULE} --host 0.0.0.0 --port ${PORT} --reload; \
  else \
    exec gunicorn -k uvicorn.workers.UvicornWorker ${APP_MODULE} \
      --bind 0.0.0.0:${PORT} \
      --workers ${WEB_CONCURRENCY} \
      --timeout ${GUNICORN_TIMEOUT} \
      --graceful-timeout 30 \
      --keep-alive 5 \
      --max-requests 1000 \
      --max-requests-jitter 100 \
      --access-logfile - \
      --error-logfile - \
      --access-logformat='%(h)s %(r)s %(s)s %(b)s %(D)s'; \
  fi \
"]
