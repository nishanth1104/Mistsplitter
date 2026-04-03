import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '@mistsplitter/core'
import { requireRole } from '../middleware/auth.js'

const AuditLogsQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
  caseId: z.string().optional(),
  action: z.string().optional(),
}).strict()

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  // GET /audit-logs — paginated global audit log
  app.get(
    '/',
    { preHandler: requireRole('analyst') },
    async (request, reply) => {
      const parsed = AuditLogsQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() })
      }
      const query = parsed.data

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
