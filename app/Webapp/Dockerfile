# ../Webapp/Dockerfile — Standalone optimized build

# ── Base ──────────────────────────────────────────────────────────────────────
FROM node:18-alpine AS base
RUN apk add --no-cache g++ make py3-pip libc6-compat
WORKDIR /app

# ── Builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Build-time args for NEXT_PUBLIC_ env vars (baked into JS bundle)
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_API_KEY
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_OPENAI_API_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_KEY=$NEXT_PUBLIC_API_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_OPENAI_API_KEY=$NEXT_PUBLIC_OPENAI_API_KEY

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Production (standalone) ───────────────────────────────────────────────────
# next.config.js output: "standalone" generates a self-contained server
# with only the 17 packages needed at runtime (vs 311 in full node_modules).
# Nginx handles /api proxy and security headers — no Express needed.
FROM node:18-alpine AS production
WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy standalone output (server + minimal node_modules + .next server bundle)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static assets (CSS, JS chunks — not included in standalone by default)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy public assets
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

# Env & port
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
EXPOSE 3000

# Health check
HEALTHCHECK --interval=15s --timeout=5s --retries=10 \
  CMD wget -qO- http://localhost:3000/ || exit 1

# Start standalone server (no Express, no npm needed)
CMD ["node", "server.js"]
