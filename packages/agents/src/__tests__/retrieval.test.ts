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
      transaction: { findMany: vi.fn().mockResolvedValue([]) },
      alert: { findMany: vi.fn().mockResolvedValue([]) },
      caseEvidence: { createMany: vi.fn().mockResolvedValue({}) },
    },
    ids: {
      evidence: vi.fn().mockReturnValue('evidence_abc'),
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

import { runRetrievalAgent } from '../agents/retrieval.js'

const CUSTOMER = {
  customerId: 'cust_1', customerType: 'individual', name: 'Alice',
  country: 'US', riskTier: 'low', createdAt: new Date(),
}
const ACCOUNT = {
  accountId: 'acct_1', customerId: 'cust_1', status: 'active',
  openedAt: new Date(), createdAt: new Date(), customer: CUSTOMER,
}
const MERCHANT = {
  merchantId: 'merch_1', name: 'Shop', category: '5411',
  country: 'US', riskTag: 'standard', createdAt: new Date(),
}
const BASE_CASE = {
  caseId: 'case_1', alertId: 'alert_1', status: 'in_review',
  priority: 'high', correlationId: 'corr_1', assignedTo: null,
  createdAt: new Date(), updatedAt: new Date(),
  alert: {
    alertId: 'alert_1', transactionId: 'txn_1',
    alertType: 'amount_threshold', severity: 'high', createdAt: new Date(),
    transaction: {
      transactionId: 'txn_1', accountId: 'acct_1', merchantId: 'merch_1',
      amount: 5000, currency: 'USD', channel: 'card',
      timestamp: new Date(), status: 'completed', createdAt: new Date(),
      account: ACCOUNT, merchant: MERCHANT,
    },
  },
}

describe('runRetrievalAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes 5 evidence rows on full data', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { transactionId: 'txn_2', amount: 1000, currency: 'USD', channel: 'card', timestamp: new Date(), status: 'completed', merchantId: 'merch_1' },
    ])
    ;(db.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const result = await runRetrievalAgent('case_1', 'run_1')

    expect(result.success).toBe(true)
    expect(db.caseEvidence.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ evidenceType: 'customer_profile' }),
          expect.objectContaining({ evidenceType: 'account_context' }),
          expect.objectContaining({ evidenceType: 'transaction_history' }),
          expect.objectContaining({ evidenceType: 'merchant_context' }),
          expect.objectContaining({ evidenceType: 'prior_alerts' }),
        ]),
      }),
    )
  })

  it('includes prior alerts count in evidence', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(db.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { alertId: 'alert_old', alertType: 'velocity', severity: 'low', createdAt: new Date() },
    ])

    await runRetrievalAgent('case_1', 'run_1')

    const calls = (db.caseEvidence.createMany as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const rows = (calls[0]![0] as { data: Array<{ evidenceType: string; payloadJson: Record<string, unknown> }> }).data
    const priorAlertsRow = rows.find((r) => r.evidenceType === 'prior_alerts')
    expect((priorAlertsRow?.payloadJson as { count?: number })?.count).toBe(1)
  })

  it('returns failure when case not found', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const result = await runRetrievalAgent('case_missing', 'run_1')
    expect(result.success).toBe(false)
  })

  it('returns failure when transaction missing', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_CASE, alert: { ...BASE_CASE.alert, transaction: null },
    })

    const result = await runRetrievalAgent('case_1', 'run_1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('missing transaction')
  })

  it('returns failure when db throws', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB crash'))

    const result = await runRetrievalAgent('case_1', 'run_1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('RetrievalAgent failed')
  })
})
