import type { FastifyInstance } from 'fastify'
import { db } from '@mistsplitter/core'
import { requireRole } from '../middleware/auth.js'

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  // GET /metrics — latest snapshot value per metric_name
  app.get(
    '/',
    { preHandler: requireRole('analyst') },
    async (_request, reply) => {
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
