import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@mistsplitter/policy', () => ({
  evaluatePolicy: vi.fn(),
}))

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      case: { findUnique: vi.fn() },
      recommendation: { findFirst: vi.fn() },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

import { runPolicyAgent } from '../agents/policy.js'
import { evaluatePolicy } from '@mistsplitter/policy'

const BASE_CASE = {
  caseId: 'case_1', alertId: 'alert_1', status: 'in_review', priority: 'high',
  correlationId: 'corr_1', assignedTo: null, createdAt: new Date(), updatedAt: new Date(),
}

const RECOMMENDATION = {
  recommendationId: 'rec_1', caseId: 'case_1', recommendedAction: 'review_further',
  summary: 'Needs review', confidence: 'medium',
  evidenceReferences: [], createdAt: new Date(),
}

describe('runPolicyAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns success with permitted decision', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.recommendation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(RECOMMENDATION)
    ;(evaluatePolicy as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, value: { decision: 'permitted', rationale: 'Standard review workflow' },
    })

    const result = await runPolicyAgent('case_1', 'run_1')

    expect(result.success).toBe(true)
    expect((result.data as { decision: string }).decision).toBe('permitted')
  })

  it('returns success with requires_approval decision', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.recommendation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(RECOMMENDATION)
    ;(evaluatePolicy as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, value: { decision: 'requires_approval', rationale: 'Senior review needed' },
    })

    const result = await runPolicyAgent('case_1', 'run_1')

    expect(result.success).toBe(true)
    expect((result.data as { decision: string }).decision).toBe('requires_approval')
  })

  it('returns failure when policy is blocked', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.recommendation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(RECOMMENDATION)
    ;(evaluatePolicy as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, value: { decision: 'blocked', rationale: 'Sanction list hit' },
    })

    const result = await runPolicyAgent('case_1', 'run_1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Policy blocked')
    expect(result.error).toContain('Sanction list hit')
  })

  it('returns failure when policy evaluation fails', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.recommendation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(evaluatePolicy as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, error: { code: 'POLICY_EVAL_FAILED', message: 'Engine error' },
    })

    const result = await runPolicyAgent('case_1', 'run_1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Policy evaluation failed')
  })

  it('returns failure when case not found', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const result = await runPolicyAgent('case_missing', 'run_1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Case not found')
  })

  it('returns failure when db throws', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB crash'))

    const result = await runPolicyAgent('case_1', 'run_1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('PolicyAgent failed')
  })
})
