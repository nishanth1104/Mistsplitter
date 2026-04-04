import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '@mistsplitter/core'
import { requireRole } from '../middleware/auth.js'

const MetricsQuerySchema = z.object({}).strict()

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  // GET /metrics — latest snapshot value per metric_name (JSON format for web dashboard)
  app.get(
    '/',
    { preHandler: requireRole('analyst') },
    async (request, reply) => {
      const parsed = MetricsQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() })
      }
      // Fetch all snapshots, then keep only latest per metricName
      const snapshots = await db.metricsSnapshot.findMany({
        orderBy: { recordedAt: 'desc' },
      })

      const latestByName = new Map<string, { metricName: string; metricValue: string; recordedAt: Date }>()
      for (const s of snapshots) {
        if (!latestByName.has(s.metricName)) {
          latestByName.set(s.metricName, {
            metricName: s.metricName,
            metricValue: String(s.metricValue),
            recordedAt: s.recordedAt,
          })
        }
      }

      const metrics = [...latestByName.values()]
      return reply.send({ metrics })
    },
  )
}
