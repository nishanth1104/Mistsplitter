import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { authMiddleware } from '../middleware/auth.js'
import { workflowRoutes } from '../routes/workflow.js'

const KNOWN_CASE_ID = 'case_01J000000000000000000002'
const KNOWN_RUN_ID = 'run_01J000000000000000000001'

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      case: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { caseId: string } }) =>
          where.caseId === 'case_01J000000000000000000002'
            ? Promise.resolve({ caseId: 'case_01J000000000000000000002', correlationId: 'corr_1' })
            : Promise.resolve(null),
        ),
      },
      workflowRun: {
        findMany: vi.fn().mockResolvedValue([{
          runId: 'run_01J000000000000000000001',
          caseId: 'case_01J000000000000000000002',
          state: 'awaiting_review',
          status: 'success',
          startedAt: new Date(),
          endedAt: null,
        }]),
      },
    },
    ids: { generate: vi.fn().mockReturnValue('generated_id') },
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

vi.mock('@mistsplitter/workflow', () => ({
  startWorkflowRun: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      runId: 'run_01J000000000000000000001',
      caseId: 'case_01J000000000000000000002',
      state: 'awaiting_review',
      status: 'running',
    },
  }),
  executeWorkflow: vi.fn().mockResolvedValue(undefined),
  RISK_REVIEW_STEPS: [],
  buildExecutors: vi.fn().mockReturnValue(new Map()),
}))

async function buildTestApp() {
  const app = Fastify({ logger: false })
  app.addHook('preHandler', authMiddleware)
  await app.register(workflowRoutes, { prefix: '/cases' })
  await app.ready()
  return app
}

const ANALYST = 'Bearer analyst:user_1:Alice'

describe('POST /cases/:id/run', () => {
  it('returns 401 without Authorization header', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'POST', url: `/cases/${KNOWN_CASE_ID}/run` })
    expect(res.statusCode).toBe(401)
  })

  it('returns 202 for a known case', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: `/cases/${KNOWN_CASE_ID}/run`,
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(202)
    const body = JSON.parse(res.body) as { runId: string; status: string }
    expect(body.status).toBe('running')
    expect(body.runId).toBe(KNOWN_RUN_ID)
  })

  it('returns 404 for an unknown case', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/cases/case_doesnotexist/run',
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /cases/:id/runs', () => {
  it('returns 200 with list of runs', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/cases/${KNOWN_CASE_ID}/runs`,
      headers: { authorization: ANALYST },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { runs: unknown[]; total: number }
    expect(Array.isArray(body.runs)).toBe(true)
    expect(body.total).toBe(1)
  })

  it('returns 401 without auth', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: `/cases/${KNOWN_CASE_ID}/runs` })
    expect(res.statusCode).toBe(401)
  })
})
