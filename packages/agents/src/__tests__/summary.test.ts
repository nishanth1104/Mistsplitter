import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockOpenAICreate = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockOpenAICreate,
      },
    },
  })),
}))

vi.mock('@mistsplitter/audit', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true }),
  AuditActions: {
    SUMMARY_GENERATION_STARTED: 'summary.generation.started',
    SUMMARY_GENERATED: 'summary.generated',
    SUMMARY_GENERATION_FAILED: 'summary.generation.failed',
  },
}))

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      case: { findUnique: vi.fn() },
      caseEvidence: { findFirst: vi.fn() },
      recommendation: { create: vi.fn().mockResolvedValue({}) },
    },
    ids: { recommendation: vi.fn().mockReturnValue('rec_abc') },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    getConfig: vi.fn().mockReturnValue({ OPENAI_API_KEY: 'sk-test-key' }),
  }
})

import { runSummaryAgent } from '../agents/summary.js'
import { writeAuditEvent } from '@mistsplitter/audit'

const BASE_CASE = {
  caseId: 'case_1', alertId: 'alert_1', status: 'in_review', priority: 'high',
  correlationId: 'corr_1', assignedTo: null, createdAt: new Date(), updatedAt: new Date(),
}

const BUNDLE_EVIDENCE = {
  evidenceId: 'ev_bundle', caseId: 'case_1', evidenceType: 'signal_summary',
  createdAt: new Date(),
  payloadJson: { riskLevel: 'high', signals: [{ name: 'high_amount', value: '15000', reason: 'Exceeds threshold' }] },
}

const VALID_LLM_RESPONSE = {
  recommended_action: 'review_further',
  summary: 'High-value transaction from PEP customer requiring human review.',
  confidence: 'high',
  evidence_references: ['high_amount', 'pep_customer'],
}

describe('runSummaryAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns recommendation on valid LLM output', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.caseEvidence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(BUNDLE_EVIDENCE)
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_LLM_RESPONSE) } }],
    })

    const result = await runSummaryAgent('case_1', 'run_1')

    expect(result.success).toBe(true)
    expect((result.data as { recommendedAction: string }).recommendedAction).toBe('review_further')
    expect(db.recommendation.create).toHaveBeenCalled()
  })

  it('writes SUMMARY_GENERATED audit event on success', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.caseEvidence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(BUNDLE_EVIDENCE)
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_LLM_RESPONSE) } }],
    })

    await runSummaryAgent('case_1', 'run_1')

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'summary.generated' }),
    )
  })

  it('returns failure and writes SUMMARY_GENERATION_FAILED when LLM output is not valid JSON', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.caseEvidence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(BUNDLE_EVIDENCE)
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: 'not json at all' } }],
    })

    const result = await runSummaryAgent('case_1', 'run_1')

    expect(result.success).toBe(false)
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'summary.generation.failed' }),
    )
  })

  it('returns failure when LLM output fails Zod validation', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.caseEvidence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(BUNDLE_EVIDENCE)
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ recommended_action: 'INVALID' }) } }],
    })

    const result = await runSummaryAgent('case_1', 'run_1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('validation failed')
  })

  it('returns failure when LLM API call fails after retries', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.caseEvidence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(BUNDLE_EVIDENCE)
    mockOpenAICreate.mockRejectedValue(new Error('API error'))

    const result = await runSummaryAgent('case_1', 'run_1')

    expect(result.success).toBe(false)
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'summary.generation.failed' }),
    )
  })

  it('returns failure when case not found', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const result = await runSummaryAgent('case_missing', 'run_1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Case not found')
  })

  it('returns failure when no evidence bundle found', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.caseEvidence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const result = await runSummaryAgent('case_1', 'run_1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('No evidence bundle')
  })

  it('handles markdown code-fenced JSON in LLM response', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.caseEvidence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(BUNDLE_EVIDENCE)
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(VALID_LLM_RESPONSE)}\n\`\`\`` } }],
    })

    const result = await runSummaryAgent('case_1', 'run_1')
    expect(result.success).toBe(true)
  })
})
