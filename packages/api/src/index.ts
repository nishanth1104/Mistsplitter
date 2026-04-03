import Fastify from 'fastify'
import cors from '@fastify/cors'
import { getConfig, logger, disconnectDb } from '@mistsplitter/core'
import { authMiddleware } from './middleware/auth.js'
import { errorHandler } from './middleware/error.js'
import { healthRoutes } from './routes/health.js'

async function buildApp() {
  const config = getConfig()

  const app = Fastify({
    logger: false, // Use our own pino logger
    bodyLimit: 1_048_576, // 1MB body size limit
    requestTimeout: 30_000, // 30s timeout
  })

  // CORS
  await app.register(cors, {
    origin: config.NODE_ENV === 'production' ? false : true,
  })

  // Inject correlation ID from header or generate one
  app.addHook('onRequest', async (request) => {
    const existingId = request.headers['x-correlation-id']
    if (!existingId) {
      request.headers['x-correlation-id'] = `req_${Date.now()}`
    }
  })

  // Add correlation ID to all responses
  app.addHook('onSend', async (request, reply) => {
    const correlationId = request.headers['x-correlation-id']
    if (correlationId) {
      void reply.header('X-Correlation-Id', correlationId)
    }
  })

  // Auth middleware runs on all non-health routes
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health') return
    await authMiddleware(request, reply)
  })

  // Global error handler
  app.setErrorHandler(errorHandler)

  // Routes
  await app.register(healthRoutes)

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
