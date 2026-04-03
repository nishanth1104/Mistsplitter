import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '@mistsplitter/core'
import { requireRole } from '../middleware/auth.js'

const AgentsQuerySchema = z.object({}).strict()
const AgentParamsSchema = z.object({ id: z.string().min(1) }).strict()

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  // GET /agents — list all registered agents
  app.get(
    '/',
    { preHandler: requireRole('analyst') },
    async (request, reply) => {
      const parsed = AgentsQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() })
      }
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
      const parsedParams = AgentParamsSchema.safeParse(request.params)
      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'Invalid path parameters', details: parsedParams.error.flatten() })
      }
      const { id } = parsedParams.data
      const agent = await db.agentRegistry.findUnique({ where: { agentId: id } })
      if (!agent) {
        return reply.status(404).send({ error: 'Agent not found', code: 'NOT_FOUND' })
      }
      return reply.send({ agent })
    },
  )
}
