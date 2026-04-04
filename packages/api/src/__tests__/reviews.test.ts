import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { authMiddleware } from '../middleware/auth.js'
import { reviewRoutes } from '../routes/reviews.js'

// vi.hoisted() runs before vi.mock factories, making the variable available inside mocks
const { mockTransaction } = vi.hoisted(() => ({ mockTransaction: vi.fn() }))

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  const CASE_ID = 'case_01J000000000000000000003'
  return {
    ...actual,
    db: {
      case: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { caseId: string } }) =>
          where.caseId === CASE_ID
            ? Promise.resolve({ caseId: CASE_ID, status: 'in_review', correlationId: 'corr_1' })
            : Promise.resolve(null),
        ),
      },
      review: {
        findFirst: vi.fn().mockResolvedValue(null), // no duplicate by default
        create: vi.fn().mockResolvedValue({
          reviewId: 'review_01', caseId: CASE_ID, finalAction: 'approved', overrideFlag: false,
        }),
      },
      $transaction: mockTransaction,
    },
    ids: { review: vi.fn().mockReturnValue('review_01') },
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

const KNOWN_CASE_ID = 'case_01J000000000000000000003'

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
  beforeEach(async () => {
    vi.clearAllMocks()

    // Restore default db mock implementations cleared by clearAllMocks
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockImplementation(({ where }: { where: { caseId: string } }) =>
      where.caseId === KNOWN_CASE_ID
        ? Promise.resolve({ caseId: KNOWN_CASE_ID, status: 'in_review', correlationId: 'corr_1' })
        : Promise.resolve(null),
    )
    ;(db.review.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    // Default: transaction succeeds
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        review: {
          create: vi.fn().mockResolvedValue({
            reviewId: 'review_01', caseId: KNOWN_CASE_ID, finalAction: 'approved', overrideFlag: false,
          }),
        },
        case: { update: vi.fn().mockResolvedValue({}) },
      }
      return fn(tx)
    })
  })

  it('returns 401 without Authorization header', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST', url: `/cases/${KNOWN_CASE_ID}/reviews`,
      payload: { finalAction: 'approved', overrideFlag: false },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 403 for analyst role (reviewer required)', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST', url: `/cases/${KNOWN_CASE_ID}/reviews`,
      headers: { authorization: 'Bearer analyst:user_1:Alice' },
      payload: { finalAction: 'approved', overrideFlag: false },
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 201 with valid review body', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST', url: `/cases/${KNOWN_CASE_ID}/reviews`,
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
      method: 'POST', url: `/cases/${KNOWN_CASE_ID}/reviews`,
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
      method: 'POST', url: `/cases/${KNOWN_CASE_ID}/reviews`,
      headers: { authorization: REVIEWER },
      payload: { finalAction: 'delete_all', overrideFlag: false },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for override without reasonCode', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST', url: `/cases/${KNOWN_CASE_ID}/reviews`,
      headers: { authorization: REVIEWER },
      payload: { finalAction: 'overridden', overrideFlag: true },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for unknown case', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST', url: '/cases/case_doesnotexist/reviews',
      headers: { authorization: REVIEWER },
      payload: { finalAction: 'approved', overrideFlag: false },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 409 when case is already closed_clear', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      caseId: KNOWN_CASE_ID, status: 'closed_clear', correlationId: 'corr_1',
    })
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST', url: `/cases/${KNOWN_CASE_ID}/reviews`,
      headers: { authorization: REVIEWER },
      payload: { finalAction: 'approved', overrideFlag: false },
    })
    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.body) as { code: string }
    expect(body.code).toBe('CASE_ALREADY_CLOSED')
  })

  it('returns 409 when case is already closed_actioned', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      caseId: KNOWN_CASE_ID, status: 'closed_actioned', correlationId: 'corr_1',
    })
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST', url: `/cases/${KNOWN_CASE_ID}/reviews`,
      headers: { authorization: REVIEWER },
      payload: { finalAction: 'approved', overrideFlag: false },
    })
    expect(res.statusCode).toBe(409)
  })

  it('returns 200 (idempotent) when same reviewer submits within 60s', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.review.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      reviewId: 'review_existing', caseId: KNOWN_CASE_ID, finalAction: 'approved',
      overrideFlag: false, reviewedAt: new Date(),
    })
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST', url: `/cases/${KNOWN_CASE_ID}/reviews`,
      headers: { authorization: REVIEWER },
      payload: { finalAction: 'approved', overrideFlag: false },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { idempotent: boolean }
    expect(body.idempotent).toBe(true)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('uses $transaction for atomic review + case update', async () => {
    const app = await buildTestApp()
    await app.inject({
      method: 'POST', url: `/cases/${KNOWN_CASE_ID}/reviews`,
      headers: { authorization: REVIEWER },
      payload: { finalAction: 'approved', overrideFlag: false },
    })
    expect(mockTransaction).toHaveBeenCalled()
  })
})
