# ──────────────────────────────────────────────────────────────
# Stage 1: Production Dependencies
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS dependencies

WORKDIR /app

# Install OpenSSL required by Prisma engine on Alpine
RUN apk add --no-cache openssl libc6-compat

# Copy package manifests & Prisma schema
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install only production dependencies & generate Prisma client
RUN npm ci --omit=dev --ignore-scripts && \
    npx prisma generate && \
    npm cache clean --force

# ──────────────────────────────────────────────────────────────
# Stage 2: Application Builder
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for Nest CLI & TS)
RUN npm ci && \
    npx prisma generate

# Copy application source code & configuration
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src/

# Compile TypeScript to production JS bundle in /app/dist
RUN npm run build && \
    npm cache clean --force

# ──────────────────────────────────────────────────────────────
# Stage 3: Minimal Production Runner (<150MB)
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install lightweight init system and OpenSSL for runtime
RUN apk add --no-cache dumb-init openssl wget && \
    rm -rf /var/cache/apk/*

ENV NODE_ENV=production \
    PORT=3000 \
    PAGER=cat

# Create app directory with proper non-root permissions
RUN chown -R node:node /app

# Copy production node_modules with Prisma client from dependencies stage
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=dependencies /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=dependencies /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy compiled JavaScript distribution files from builder stage
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node package.json ./

# Switch to unprivileged non-root user
USER node

EXPOSE 3000

# Health check to monitor container responsiveness
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

# Process supervisor signal handling
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "dist/main.js"]
