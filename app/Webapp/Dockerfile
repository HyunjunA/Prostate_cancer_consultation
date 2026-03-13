# ../Webapp/Dockerfile

# Base
FROM node:18-alpine AS base
RUN apk add --no-cache g++ make py3-pip libc6-compat
WORKDIR /app
COPY package*.json ./

# Builder
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
# Copy .env file (it should be in the build context root)
# COPY ./.env ./.env
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production
FROM node:18-alpine AS production
WORKDIR /app

# Install runtime dependencies only
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

# COPY --from=builder /app/.env .env

# Copy Next build output & public assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy custom Express server
COPY --from=builder /app/server.js ./server.js

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

# Env & port
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# Start
CMD ["node", "server.js"]
