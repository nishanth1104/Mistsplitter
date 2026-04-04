# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/audit/package.json ./packages/audit/
COPY packages/agents/package.json ./packages/agents/
COPY packages/policy/package.json ./packages/policy/

RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY packages/core ./packages/core
COPY packages/audit ./packages/audit
COPY packages/policy ./packages/policy
COPY packages/agents ./packages/agents
COPY packages/mcp ./packages/mcp
COPY tsconfig.json ./

RUN pnpm --filter @mistsplitter/core build && \
    pnpm --filter @mistsplitter/audit build && \
    pnpm --filter @mistsplitter/policy build && \
    pnpm --filter @mistsplitter/agents build && \
    pnpm --filter @mistsplitter/mcp build

# ─── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/mcp/package.json ./packages/mcp/
COPY --from=builder /app/packages/audit/package.json ./packages/audit/
COPY --from=builder /app/packages/agents/package.json ./packages/agents/
COPY --from=builder /app/packages/policy/package.json ./packages/policy/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/audit/dist ./packages/audit/dist
COPY --from=builder /app/packages/policy/dist ./packages/policy/dist
COPY --from=builder /app/packages/agents/dist ./packages/agents/dist
COPY --from=builder /app/packages/mcp/dist ./packages/mcp/dist

COPY --from=builder /app/packages/core/prisma ./packages/core/prisma

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "packages/mcp/dist/index.js"]
