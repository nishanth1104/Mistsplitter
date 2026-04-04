import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '@mistsplitter/core'
import { requireRole } from '../middleware/auth.js'

const CasesQuerySchema = z.object({
  status: z.enum(['pending', 'in_review', 'escalated', 'closed_clear', 'closed_actioned']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
}).strict()

const CaseParamsSchema = z.object({ id: z.string().min(1) }).strict()

export async function caseRoutes(app: FastifyInstance): Promise<void> {
  // GET /cases — list cases with optional status/priority filter
  app.get(
    '/',
    { preHandler: requireRole('analyst') },
    async (request, reply) => {
      const parsed = CasesQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() })
      }
      const query = parsed.data
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
      const parsedParams = CaseParamsSchema.safeParse(request.params)
      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'Invalid path parameters', details: parsedParams.error.flatten() })
      }
      const { id } = parsedParams.data

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
