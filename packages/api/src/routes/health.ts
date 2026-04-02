import type { FastifyInstance } from 'fastify'
import { db } from '@mistsplitter/core'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    // Check DB connectivity
    try {
      await db.$queryRaw`SELECT 1`
      await reply.status(200).send({
        status: 'ok',
        service: 'mistsplitter-api',
        timestamp: new Date().toISOString(),
        database: 'connected',
      })
    } catch {
      await reply.status(503).send({
        status: 'degraded',
        service: 'mistsplitter-api',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      })
    }
  })
}
