# ========= Base =========
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive \
    # Default runtime settings (can be overridden at runtime)
    APP_MODULE=main:app \
    WEB_CONCURRENCY=3 \
    GUNICORN_TIMEOUT=60 \
    PORT=8000 \
    # Trust proxy headers if behind Nginx/Traefik
    FORWARDED_ALLOW_IPS=* \
    # Optional: reduce glibc arena fragmentation
    MALLOC_ARENA_MAX=2 \
    # Optional: normalize timezone
    TZ=UTC

WORKDIR /app

# Minimal runtime deps + tini (PID 1)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl tini libpq5 \
 && rm -rf /var/lib/apt/lists/*

# Dependencies (cacheable)
COPY requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip \
 && pip install -r /app/requirements.txt \
 && pip install 'uvicorn[standard]' --no-cache-dir || true

# App code (non-root)
RUN useradd -m appuser
COPY --chown=appuser:appuser . /app

# Writable dirs
RUN mkdir -p /app/logs /app/uploads /app/data /app/static \
 && chown -R appuser:appuser /app

USER appuser
EXPOSE ${PORT}

# prestart hook (DB wait / seed; Alembic is commented)
ENV PRE_START_PATH=/app/prestart.sh
RUN printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -e' \
  '' \
  '# Wait for database if script exists' \
  '[ -f /app/wait_for_db.py ] && python /app/wait_for_db.py || true' \
  '' \
  '# Initialize database if script exists' \
  '[ -f /app/init_db.py ] && python /app/init_db.py || true' \
  '' \
  '# [MIGRATION-RELATED] Uncomment to enable Alembic migrations at startup' \
  '# if [ -f /app/alembic.ini ]; then' \
  '#   alembic upgrade head || true' \
  '# fi' \
  > /app/prestart.sh \
 && chmod +x /app/prestart.sh

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl --silent --show-error --fail http://localhost:${PORT}/health || exit 1

# tini as PID 1
ENTRYPOINT ["/usr/bin/tini","--"]

# Suggestive ENV hooks for DB pool tuning (your app should read these)
ENV DATABASE_POOL_SIZE=10 \
    DATABASE_MAX_OVERFLOW=20 \
    DATABASE_POOL_TIMEOUT=30

# Run mode
ENV RUN_ENV=prod

# Start command:
# - compute default WEB_CONCURRENCY = 2 * nproc + 1 (if not set)
# - raise file descriptor limit (best-effort)
# - pass gunicorn flags directly (no env-indirection that breaks quoting)
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
