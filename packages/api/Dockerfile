# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/api/package.json ./packages/api/
COPY packages/audit/package.json ./packages/audit/
COPY packages/workflow/package.json ./packages/workflow/
COPY packages/agents/package.json ./packages/agents/
COPY packages/policy/package.json ./packages/policy/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Copy source
COPY packages/core ./packages/core
COPY packages/audit ./packages/audit
COPY packages/policy ./packages/policy
COPY packages/agents ./packages/agents
COPY packages/workflow ./packages/workflow
COPY packages/api ./packages/api
COPY tsconfig.json ./

# Build all packages in dependency order
RUN pnpm --filter @mistsplitter/core build && \
    pnpm --filter @mistsplitter/audit build && \
    pnpm --filter @mistsplitter/policy build && \
    pnpm --filter @mistsplitter/agents build && \
    pnpm --filter @mistsplitter/workflow build && \
    pnpm --filter @mistsplitter/api build

# ─── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy only what's needed at runtime
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/api/package.json ./packages/api/
COPY --from=builder /app/packages/audit/package.json ./packages/audit/
COPY --from=builder /app/packages/workflow/package.json ./packages/workflow/
COPY --from=builder /app/packages/agents/package.json ./packages/agents/
COPY --from=builder /app/packages/policy/package.json ./packages/policy/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/audit/dist ./packages/audit/dist
COPY --from=builder /app/packages/policy/dist ./packages/policy/dist
COPY --from=builder /app/packages/agents/dist ./packages/agents/dist
COPY --from=builder /app/packages/workflow/dist ./packages/workflow/dist
COPY --from=builder /app/packages/api/dist ./packages/api/dist

# Copy Prisma schema (needed at runtime for migrations)
COPY --from=builder /app/packages/core/prisma ./packages/core/prisma

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "packages/api/dist/index.js"]
