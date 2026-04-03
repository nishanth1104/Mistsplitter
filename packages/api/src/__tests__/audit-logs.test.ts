import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { authMiddleware } from '../middleware/auth.js'
import { auditLogRoutes } from '../routes/audit-logs.js'

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([{
          logId: 'log_01J000000000000000000001',
          caseId: 'case_01J000000000000000000001',
          actorId: 'user_1',
          actorRole: 'reviewer',
          action: 'review.submitted',
          payloadJson: {},
          createdAt: new Date(),
        }]),
        count: vi.fn().mockResolvedValue(1),
      },
    },
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

async function buildTestApp() {
  const app = Fastify({ logger: false })
  app.addHook('preHandler', authMiddleware)
  await app.register(auditLogRoutes, { prefix: '/audit-logs' })
  await app.ready()
  return app
}

const ANALYST = 'Bearer analyst:user_1:Alice'

describe('GET /audit-logs', () => {
  it('returns 401 without Authorization header', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/audit-logs' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 200 with analyst token', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { logs: unknown[]; total: number; limit: number; offset: number }
    expect(Array.isArray(body.logs)).toBe(true)
    expect(typeof body.total).toBe('number')
    expect(typeof body.limit).toBe('number')
    expect(typeof body.offset).toBe('number')
  })

  it('returns 400 for unknown query field', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs?unknownField=x',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body) as { error: string }
    expect(body.error).toBe('Invalid query parameters')
  })

  it('accepts valid query parameters', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs?limit=50&offset=0&action=review.submitted',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(200)
  })

  it('accepts caseId filter', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs?caseId=case_01J000000000000000000001',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(200)
  })
})
