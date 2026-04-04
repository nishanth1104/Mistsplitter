import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import helmet from '@fastify/helmet'
import { register as promRegister, collectDefaultMetrics, Counter, Histogram } from 'prom-client'
import { getConfig, logger, disconnectDb, ids } from '@mistsplitter/core'
import { authMiddleware } from './middleware/auth.js'
import { errorHandler } from './middleware/error.js'
import { healthRoutes } from './routes/health.js'
import { caseRoutes } from './routes/cases.js'
import { workflowRoutes } from './routes/workflow.js'
import { reviewRoutes } from './routes/reviews.js'
import { agentRoutes } from './routes/agents.js'
import { metricsRoutes } from './routes/metrics.js'
import { auditLogRoutes } from './routes/audit-logs.js'

// ─── Prometheus metrics ───────────────────────────────────────────────────────
collectDefaultMetrics()

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
})

export const workflowRunsTotal = new Counter({
  name: 'workflow_runs_total',
  help: 'Total workflow runs by status',
  labelNames: ['status'],
})

export const agentExecutionsTotal = new Counter({
  name: 'agent_executions_total',
  help: 'Total agent executions by agent name and status',
  labelNames: ['agent_name', 'status'],
})

export const llmCallsTotal = new Counter({
  name: 'llm_calls_total',
  help: 'Total LLM calls',
  labelNames: ['model', 'status'],
})

export const llmCallDuration = new Histogram({
  name: 'llm_call_duration_ms',
  help: 'LLM call duration in milliseconds',
  labelNames: ['model'],
  buckets: [100, 500, 1000, 3000, 10000, 30000],
})

export { promRegister }

async function buildApp() {
  const config = getConfig()

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
    bodyLimit: 1_048_576, // 1MB body size limit
    requestTimeout: 30_000, // 30s timeout
  })

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // API-only, no HTML
  })

  // CORS
  await app.register(cors, {
    origin: config.NODE_ENV === 'production' ? false : true,
  })

  // Rate limiting — global: 100 req/min per IP
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, context) => ({
      error: 'Too Many Requests',
      code: 'RATE_LIMITED',
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
  })

  // Inject correlation ID from header or generate one using ULID
  app.addHook('onRequest', async (request) => {
    const existingId = request.headers['x-correlation-id']
    if (!existingId) {
      request.headers['x-correlation-id'] = ids.correlationId()
    }
  })

  // Track HTTP request duration for Prometheus
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routerPath ?? request.url
    httpRequestDuration
      .labels(request.method, route, String(reply.statusCode))
      .observe(reply.elapsedTime)
  })

  // Add correlation ID to all responses
  app.addHook('onSend', async (request, reply) => {
    const correlationId = request.headers['x-correlation-id']
    if (correlationId) {
      void reply.header('X-Correlation-Id', correlationId)
    }
  })

  // Auth middleware runs on all non-health and non-prometheus routes
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health' || request.url === '/prometheus') return
    await authMiddleware(request, reply)
  })

  // Global error handler
  app.setErrorHandler(errorHandler)

  // Routes
  await app.register(healthRoutes)
  await app.register(caseRoutes, { prefix: '/cases' })
  await app.register(workflowRoutes, { prefix: '/cases' })
  await app.register(reviewRoutes, { prefix: '/cases' })
  await app.register(agentRoutes, { prefix: '/agents' })
  await app.register(metricsRoutes, { prefix: '/metrics' })
  await app.register(auditLogRoutes, { prefix: '/audit-logs' })

  // Prometheus scrape endpoint — no auth required
  app.get('/prometheus', async (_request, reply) => {
    reply.header('Content-Type', promRegister.contentType)
    return reply.send(await promRegister.metrics())
  })

  return app
}

async function main() {
  const config = getConfig()
  const app = await buildApp()

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    logger.info({ port: config.PORT }, 'API server started')
  } catch (err) {
    logger.error({ err }, 'Failed to start API server')
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down')
  await disconnectDb()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down')
  await disconnectDb()
  process.exit(0)
})

// Only run main() when this file is the direct entry point, not when imported by tests
const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/index.js') ||
    process.argv[1].endsWith('\\index.js') ||
    process.argv[1].endsWith('/index.ts') ||
    process.argv[1].endsWith('\\index.ts'))

if (isMain) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Fatal startup error:', err)
    process.exit(1)
  })
}

export { buildApp }
