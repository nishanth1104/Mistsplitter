import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { authMiddleware } from '../middleware/auth.js'
import { agentRoutes } from '../routes/agents.js'

const KNOWN_AGENT_ID = 'agent_01J000000000000000000001'

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      agentRegistry: {
        findMany: vi.fn().mockResolvedValue([{
          agentId: 'agent_01J000000000000000000001',
          name: 'IntakeAgent',
          role: 'intake',
          status: 'active',
          riskLevel: 'low',
          approvedTools: ['create_case'],
          allowedActions: ['validate'],
          createdAt: new Date(),
        }]),
        findUnique: vi.fn().mockImplementation(({ where }: { where: { agentId: string } }) =>
          where.agentId === 'agent_01J000000000000000000001'
            ? Promise.resolve({
                agentId: 'agent_01J000000000000000000001',
                name: 'IntakeAgent',
                role: 'intake',
                status: 'active',
                riskLevel: 'low',
                approvedTools: ['create_case'],
                allowedActions: ['validate'],
                createdAt: new Date(),
              })
            : Promise.resolve(null),
        ),
      },
    },
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

async function buildTestApp() {
  const app = Fastify({ logger: false })
  app.addHook('preHandler', authMiddleware)
  await app.register(agentRoutes, { prefix: '/agents' })
  await app.ready()
  return app
}

const ANALYST = 'Bearer analyst:user_1:Alice'

describe('GET /agents', () => {
  it('returns 401 without Authorization header', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/agents' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 200 with valid analyst token', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/agents',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { agents: unknown[]; total: number }
    expect(Array.isArray(body.agents)).toBe(true)
    expect(body.total).toBe(1)
  })

  it('returns 400 for unknown query field', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/agents?unknownField=x',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body) as { error: string }
    expect(body.error).toBe('Invalid query parameters')
  })
})

describe('GET /agents/:id', () => {
  it('returns 200 for a known agent ID', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/agents/${KNOWN_AGENT_ID}`,
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { agent: { agentId: string } }
    expect(body.agent.agentId).toBe(KNOWN_AGENT_ID)
  })

  it('returns 404 for an unknown agent ID', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/agents/agent_doesnotexist',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(404)
    const body = JSON.parse(res.body) as { error: string }
    expect(body.error).toBe('Agent not found')
  })
})
