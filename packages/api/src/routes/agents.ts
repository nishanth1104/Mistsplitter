import type { FastifyInstance } from 'fastify'
import { db } from '@mistsplitter/core'
import { requireRole } from '../middleware/auth.js'

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  // GET /agents — list all registered agents
  app.get(
    '/',
    { preHandler: requireRole('analyst') },
    async (_request, reply) => {
      const agents = await db.agentRegistry.findMany({
        orderBy: { name: 'asc' },
      })
      return reply.send({ agents, total: agents.length })
    },
  )

  // GET /agents/:id — single agent detail
  app.get(
    '/:id',
    { preHandler: requireRole('analyst') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const agent = await db.agentRegistry.findUnique({ where: { agentId: id } })
      if (!agent) {
        return reply.status(404).send({ error: 'Agent not found', code: 'NOT_FOUND' })
      }
      return reply.send({ agent })
    },
  )
}
