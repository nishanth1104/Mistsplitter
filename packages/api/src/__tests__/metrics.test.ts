import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { authMiddleware } from '../middleware/auth.js'
import { metricsRoutes } from '../routes/metrics.js'

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      metricsSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          { metricName: 'queue_backlog', metricValue: '12', recordedAt: new Date() },
          { metricName: 'override_rate', metricValue: '0.05', recordedAt: new Date() },
        ]),
      },
    },
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

async function buildTestApp() {
  const app = Fastify({ logger: false })
  app.addHook('preHandler', authMiddleware)
  await app.register(metricsRoutes, { prefix: '/metrics' })
  await app.ready()
  return app
}

const ANALYST = 'Bearer analyst:user_1:Alice'

describe('GET /metrics', () => {
  it('returns 401 without Authorization header', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 200 with analyst token and deduplicated metrics', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { metrics: Array<{ metricName: string; metricValue: string }> }
    expect(Array.isArray(body.metrics)).toBe(true)
    expect(body.metrics.length).toBe(2)
    expect(typeof body.metrics[0]?.metricName).toBe('string')
  })

  it('returns 400 for unknown query field', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/metrics?unknownField=x',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body) as { error: string }
    expect(body.error).toBe('Invalid query parameters')
  })
})
