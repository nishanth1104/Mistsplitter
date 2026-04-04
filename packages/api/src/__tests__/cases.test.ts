import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { authMiddleware } from '../middleware/auth.js'
import { caseRoutes } from '../routes/cases.js'

// Fixtures — not referenced inside vi.mock (avoids TDZ hoisting issue)
const KNOWN_CASE_ID = 'case_01J000000000000000000001'

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      case: {
        findMany: vi.fn().mockResolvedValue([{
          caseId: 'case_01J000000000000000000001',
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          alert: { alertId: 'alert_1', alertType: 'suspicious_transaction', severity: 'high' },
          recommendations: [],
          workflowRuns: [],
        }]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockImplementation(({ where }: { where: { caseId: string } }) =>
          where.caseId === 'case_01J000000000000000000001'
            ? Promise.resolve({
                caseId: 'case_01J000000000000000000001',
                status: 'pending',
                priority: 'high',
                createdAt: new Date(),
                updatedAt: new Date(),
                alert: { alertId: 'alert_1', alertType: 'suspicious_transaction', severity: 'high', transaction: null },
                recommendations: [],
                reviews: [],
                workflowRuns: [],
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
  await app.register(caseRoutes, { prefix: '/cases' })
  await app.ready()
  return app
}

const ANALYST = 'Bearer analyst:user_1:Alice'

describe('GET /cases', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without Authorization header', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/cases' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 200 with valid analyst token', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/cases',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { cases: unknown[]; total: number }
    expect(Array.isArray(body.cases)).toBe(true)
    expect(typeof body.total).toBe('number')
  })

  it('returns 400 for unknown query field', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/cases?unknownField=x',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body) as { error: string }
    expect(body.error).toBe('Invalid query parameters')
  })

  it('accepts valid status and limit params', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/cases?status=pending&limit=10&offset=0',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(200)
  })

  it('returns 400 for invalid status value', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/cases?status=invalid_status',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body) as { error: string }
    expect(body.error).toBe('Invalid query parameters')
  })

  it('returns 400 for invalid priority value', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/cases?priority=super_urgent',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(400)
  })

  it('accepts all valid status enum values', async () => {
    const app = await buildTestApp()
    const validStatuses = ['pending', 'in_review', 'escalated', 'closed_clear', 'closed_actioned']
    for (const status of validStatuses) {
      const res = await app.inject({
        method: 'GET', url: `/cases?status=${status}`, headers: { authorization: ANALYST },
      })
      expect(res.statusCode).toBe(200)
    }
  })

  it('accepts all valid priority enum values', async () => {
    const app = await buildTestApp()
    const validPriorities = ['critical', 'high', 'medium', 'low']
    for (const priority of validPriorities) {
      const res = await app.inject({
        method: 'GET', url: `/cases?priority=${priority}`, headers: { authorization: ANALYST },
      })
      expect(res.statusCode).toBe(200)
    }
  })
})

describe('GET /cases/:id', () => {
  it('returns 200 for a known case ID', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/cases/${KNOWN_CASE_ID}`,
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { case: { caseId: string } }
    expect(body.case.caseId).toBe(KNOWN_CASE_ID)
  })

  it('returns 404 for an unknown case ID', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/cases/case_doesnotexist',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(404)
    const body = JSON.parse(res.body) as { error: string }
    expect(body.error).toBe('Case not found')
  })

  it('returns 401 without auth', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: `/cases/${KNOWN_CASE_ID}` })
    expect(res.statusCode).toBe(401)
  })
})
