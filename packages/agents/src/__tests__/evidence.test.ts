import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@mistsplitter/audit', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true }),
  AuditActions: { AGENT_COMPLETED: 'agent.completed' },
}))

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      case: { findUnique: vi.fn() },
      riskSignal: { findMany: vi.fn() },
      caseEvidence: { findMany: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    },
    ids: { evidence: vi.fn().mockReturnValue('evidence_bundle') },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

import { runEvidenceAgent } from '../agents/evidence.js'

const BASE_CASE = {
  caseId: 'case_1', alertId: 'alert_1', status: 'in_review', priority: 'high',
  correlationId: 'corr_1', assignedTo: null, createdAt: new Date(), updatedAt: new Date(),
}

const HIGH_RISK_SIGNALS = [
  { signalId: 's1', caseId: 'case_1', signalName: 'high_amount', signalValue: '15000', signalReason: 'high', createdAt: new Date() },
  { signalId: 's2', caseId: 'case_1', signalName: 'pep_customer', signalValue: 'true', signalReason: 'pep', createdAt: new Date() },
]

const EVIDENCE_ROWS = [
  { evidenceId: 'ev1', caseId: 'case_1', evidenceType: 'customer_profile', payloadJson: {}, createdAt: new Date() },
  { evidenceId: 'ev2', caseId: 'case_1', evidenceType: 'account_context', payloadJson: {}, createdAt: new Date() },
]

describe('runEvidenceAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns high risk when 2+ high-risk signals triggered', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.riskSignal.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(HIGH_RISK_SIGNALS)
    ;(db.caseEvidence.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(EVIDENCE_ROWS)

    const result = await runEvidenceAgent('case_1', 'run_1')

    expect(result.success).toBe(true)
    expect((result.data as { riskLevel: string }).riskLevel).toBe('high')
  })

  it('returns medium risk when exactly 1 high-risk signal', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.riskSignal.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([HIGH_RISK_SIGNALS[0]])
    ;(db.caseEvidence.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(EVIDENCE_ROWS)

    const result = await runEvidenceAgent('case_1', 'run_1')

    expect((result.data as { riskLevel: string }).riskLevel).toBe('medium')
  })

  it('returns low risk when no high-risk signals', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.riskSignal.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { signalId: 's3', caseId: 'case_1', signalName: 'cross_border', signalValue: 'EUR', signalReason: 'cross', createdAt: new Date() },
    ])
    ;(db.caseEvidence.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(EVIDENCE_ROWS)

    const result = await runEvidenceAgent('case_1', 'run_1')

    expect((result.data as { riskLevel: string }).riskLevel).toBe('low')
  })

  it('writes a signal_summary evidence row', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.riskSignal.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(HIGH_RISK_SIGNALS)
    ;(db.caseEvidence.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(EVIDENCE_ROWS)

    await runEvidenceAgent('case_1', 'run_1')

    expect(db.caseEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ evidenceType: 'signal_summary' }),
      }),
    )
  })

  it('returns failure when case not found', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const result = await runEvidenceAgent('case_missing', 'run_1')
    expect(result.success).toBe(false)
  })

  it('returns failure when db throws', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'))

    const result = await runEvidenceAgent('case_1', 'run_1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('EvidenceAgent failed')
  })
})
