import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { authMiddleware } from '../middleware/auth.js'
import { reviewRoutes } from '../routes/reviews.js'

const KNOWN_CASE_ID = 'case_01J000000000000000000003'

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      case: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { caseId: string } }) =>
          where.caseId === 'case_01J000000000000000000003'
            ? Promise.resolve({ caseId: 'case_01J000000000000000000003', correlationId: 'corr_1' })
            : Promise.resolve(null),
        ),
        update: vi.fn().mockResolvedValue({ caseId: 'case_01J000000000000000000003', status: 'closed_clear' }),
      },
      review: {
        create: vi.fn().mockResolvedValue({
          reviewId: 'review_01',
          caseId: 'case_01J000000000000000000003',
          finalAction: 'approved',
          overrideFlag: false,
        }),
      },
    },
    ids: { review: vi.fn().mockReturnValue('review_01') },
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

vi.mock('@mistsplitter/audit', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  AuditActions: {
    REVIEW_SUBMITTED: 'review.submitted',
    REVIEW_OVERRIDDEN: 'review.overridden',
    REVIEW_ESCALATED: 'review.escalated',
  },
}))

async function buildTestApp() {
  const app = Fastify({ logger: false })
  app.addHook('preHandler', authMiddleware)
  await app.register(reviewRoutes, { prefix: '/cases' })
  await app.ready()
  return app
}

const REVIEWER = 'Bearer reviewer:user_1:Jane'

describe('POST /cases/:id/reviews', () => {
  it('returns 401 without Authorization header', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: `/cases/${KNOWN_CASE_ID}/reviews`,
      payload: { finalAction: 'approved', overrideFlag: false },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 403 for analyst role (reviewer required)', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: `/cases/${KNOWN_CASE_ID}/reviews`,
      headers: { authorization: 'Bearer analyst:user_1:Alice' },
      payload: { finalAction: 'approved', overrideFlag: false },
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 201 with valid review body', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: `/cases/${KNOWN_CASE_ID}/reviews`,
      headers: { authorization: REVIEWER },
      payload: { finalAction: 'approved', overrideFlag: false },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body) as { reviewId: string; finalAction: string }
    expect(body.finalAction).toBe('approved')
  })

  it('returns 400 when finalAction is missing', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: `/cases/${KNOWN_CASE_ID}/reviews`,
      headers: { authorization: REVIEWER },
      payload: { overrideFlag: false },
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body) as { error: string }
    expect(body.error).toMatch(/[Ii]nvalid/)
  })

  it('returns 400 when finalAction is an unrecognized value', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: `/cases/${KNOWN_CASE_ID}/reviews`,
      headers: { authorization: REVIEWER },
      payload: { finalAction: 'delete_all', overrideFlag: false },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for override without reasonCode', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: `/cases/${KNOWN_CASE_ID}/reviews`,
      headers: { authorization: REVIEWER },
      payload: { finalAction: 'overridden', overrideFlag: true },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for unknown case', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/cases/case_doesnotexist/reviews',
      headers: { authorization: REVIEWER },
      payload: { finalAction: 'approved', overrideFlag: false },
    })
    expect(res.statusCode).toBe(404)
  })
})
