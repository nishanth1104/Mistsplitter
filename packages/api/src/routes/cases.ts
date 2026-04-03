import type { FastifyInstance } from 'fastify'
import { db } from '@mistsplitter/core'
import { requireRole } from '../middleware/auth.js'

export async function caseRoutes(app: FastifyInstance): Promise<void> {
  // GET /cases — list cases with optional status/priority filter
  app.get(
    '/',
    { preHandler: requireRole('analyst') },
    async (request, reply) => {
      const query = request.query as { status?: string; priority?: string; limit?: string; offset?: string }
      const limit = Math.min(parseInt(query.limit ?? '50', 10), 200)
      const offset = parseInt(query.offset ?? '0', 10)

      const where: Record<string, unknown> = {}
      if (query.status) where['status'] = query.status
      if (query.priority) where['priority'] = query.priority

      const [cases, total] = await Promise.all([
        db.case.findMany({
          where,
          include: {
            alert: true,
            recommendations: { orderBy: { createdAt: 'desc' }, take: 1 },
            workflowRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        db.case.count({ where }),
      ])

      return reply.send({ cases, total, limit, offset })
    },
  )

  // GET /cases/:id — get case detail
  app.get(
    '/:id',
    { preHandler: requireRole('analyst') },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const caseRecord = await db.case.findUnique({
        where: { caseId: id },
        include: {
          alert: { include: { transaction: true } },
          recommendations: { orderBy: { createdAt: 'desc' }, take: 1 },
          reviews: { orderBy: { reviewedAt: 'desc' }, take: 1 },
          workflowRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
        },
      })

      if (!caseRecord) {
        return reply.status(404).send({ error: 'Case not found', code: 'NOT_FOUND' })
      }

      return reply.send({ case: caseRecord })
    },
  )
}
