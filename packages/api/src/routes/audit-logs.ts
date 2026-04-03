import type { FastifyInstance } from 'fastify'
import { db } from '@mistsplitter/core'
import { requireRole } from '../middleware/auth.js'

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  // GET /audit-logs — paginated global audit log
  app.get(
    '/',
    { preHandler: requireRole('analyst') },
    async (request, reply) => {
      const query = request.query as {
        limit?: string
        offset?: string
        caseId?: string
        action?: string
      }

      const limit = Math.min(parseInt(query.limit ?? '100', 10), 500)
      const offset = parseInt(query.offset ?? '0', 10)

      const where: Record<string, unknown> = {}
      if (query.caseId) where['caseId'] = query.caseId
      if (query.action) where['action'] = query.action

      const [logs, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        db.auditLog.count({ where }),
      ])

      return reply.send({ logs, total, limit, offset })
    },
  )
}
