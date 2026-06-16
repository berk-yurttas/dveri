# syntax=docker/dockerfile:1
# Hardened multi-stage build for the Next.js app.
# Build context is the repo root (see docker-compose.yml: context: .).
# Runtime image is minimal Next.js "standalone" output, run as a non-root user.

# ---------- deps: resolve dependencies only ----------
FROM node:20-alpine AS deps
WORKDIR /app
# Copy manifests first for better layer caching. package-lock.json / .npmrc are
# optional (the trailing * keeps the COPY valid if they are absent).
COPY dtfrontend/package.json dtfrontend/package-lock.json* dtfrontend/.npmrc* ./
# `npm install` reconciles the patched versions pinned in package.json.
# TODO: commit a lockfile and switch this to `npm ci` for reproducible builds.
RUN npm install --no-audit --no-fund

# ---------- builder: compile the standalone server ----------
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
# .dockerignore excludes node_modules/ and .next/, so this is a clean source copy.
COPY dtfrontend/ ./
# next.config.ts sets `output: "standalone"` on Linux -> emits .next/standalone.
RUN npm run build

# ---------- runner: minimal, non-root runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The `node` user (uid/gid 1000) ships with the base image. The runtime image
# contains only the traced standalone output: no toolchain, no full node_modules,
# no npm — so an RCE in the app process has far less to work with.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
# Launch the standalone server directly. Do NOT use `next start` with standalone output.
CMD ["node", "server.js"]
