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
      riskSignal: { createMany: vi.fn().mockResolvedValue({}) },
      caseEvidence: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    ids: { signal: vi.fn().mockReturnValue('signal_abc') },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    getConfig: vi.fn().mockReturnValue({
      HIGH_AMOUNT_THRESHOLD: 10000,
      RAPID_SUCCESSION_COUNT: 3,
      RAPID_SUCCESSION_HOURS: 24,
      AMOUNT_DEVIATION_MULTIPLIER: 2,
    }),
  }
})

import { runSignalAgent } from '../agents/signal.js'

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    caseId: 'case_1', alertId: 'alert_1', status: 'in_review', priority: 'high',
    correlationId: 'corr_1', assignedTo: null, createdAt: new Date(), updatedAt: new Date(),
    alert: {
      alertId: 'alert_1', transactionId: 'txn_1',
      alertType: 'amount_threshold', severity: 'high', createdAt: new Date(),
      transaction: {
        transactionId: 'txn_1', accountId: 'acct_1', merchantId: 'merch_1',
        amount: 5000, currency: 'USD', channel: 'card',
        timestamp: new Date(), status: 'completed', createdAt: new Date(),
        account: {
          accountId: 'acct_1', customerId: 'cust_1', status: 'active',
          openedAt: new Date(), createdAt: new Date(),
          customer: {
            customerId: 'cust_1', name: 'Alice', customerType: 'individual',
            country: 'US', riskTier: 'low', createdAt: new Date(),
          },
        },
        merchant: {
          merchantId: 'merch_1', name: 'Shop', category: '5411',
          country: 'US', riskTag: 'standard', createdAt: new Date(),
        },
        ...overrides,
      },
    },
  }
}

describe('runSignalAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function getSignalNames(caseData: ReturnType<typeof makeCase>, evidenceOverrides?: unknown) {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(caseData)
    ;(db.caseEvidence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(evidenceOverrides ?? null)
    const result = await runSignalAgent('case_1', 'run_1')
    expect(result.success).toBe(true)
    return result.data as { signals: string[] }
  }

  it('does NOT fire high_amount for amount ≤ threshold', async () => {
    const { signals } = await getSignalNames(makeCase({ amount: 5000 }))
    expect(signals).not.toContain('high_amount')
  })

  it('fires high_amount for amount > 10000', async () => {
    const { signals } = await getSignalNames(makeCase({ amount: 15000 }))
    expect(signals).toContain('high_amount')
  })

  it('fires pep_customer for PEP risk tier', async () => {
    const c = makeCase()
    ;(c.alert.transaction.account.customer as { riskTier: string }).riskTier = 'pep'
    const { signals } = await getSignalNames(c)
    expect(signals).toContain('pep_customer')
  })

  it('fires unusual_merchant_category for restricted merchant', async () => {
    const c = makeCase()
    ;(c.alert.transaction.merchant as { riskTag: string }).riskTag = 'restricted'
    const { signals } = await getSignalNames(c)
    expect(signals).toContain('unusual_merchant_category')
  })

  it('fires cross_border for non-USD currency', async () => {
    const { signals } = await getSignalNames(makeCase({ currency: 'EUR' }))
    expect(signals).toContain('cross_border')
  })

  it('fires prior_alert_history when prior alerts count > 0', async () => {
    const { signals } = await getSignalNames(
      makeCase(),
      { payloadJson: { count: 2 } },
    )
    // prior_alerts evidence is returned by first findFirst call
    const { db } = await import('@mistsplitter/core')
    ;(db.caseEvidence.findFirst as ReturnType<typeof vi.fn>).mockImplementation((args: { where: { evidenceType: string } }) => {
      if (args.where.evidenceType === 'prior_alerts') return Promise.resolve({ payloadJson: { count: 2 } })
      return Promise.resolve(null)
    })
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase())
    const result2 = await runSignalAgent('case_1', 'run_1')
    expect(result2.success).toBe(true)
    const signals2 = (result2.data as { signals: string[] }).signals
    expect(signals2).toContain('prior_alert_history')
    void signals
  })

  it('fires rapid_succession when recent txn count exceeds threshold', async () => {
    // Create 5 transactions all within the last hour
    const recentTxns = Array.from({ length: 5 }, (_, i) => ({
      transactionId: `txn_${i}`, amount: 500, currency: 'USD', channel: 'card',
      timestamp: new Date(Date.now() - 10_000 * i), status: 'completed',
    }))
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase())
    ;(db.caseEvidence.findFirst as ReturnType<typeof vi.fn>).mockImplementation((args: { where: { evidenceType: string } }) => {
      if (args.where.evidenceType === 'transaction_history') return Promise.resolve({ payloadJson: { transactions: recentTxns } })
      return Promise.resolve(null)
    })
    const result = await runSignalAgent('case_1', 'run_1')
    expect(result.success).toBe(true)
    expect((result.data as { signals: string[] }).signals).toContain('rapid_succession')
  })

  it('fires amount_deviation when deviation > multiplier', async () => {
    // avg = 1000, txnAmount = 50000 → deviation = 49 > 2
    const recentTxns = Array.from({ length: 5 }, (_, i) => ({
      transactionId: `txn_${i}`, amount: 1000, currency: 'USD', channel: 'card',
      timestamp: new Date(Date.now() - 1_000_000 * i), status: 'completed',
    }))
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase({ amount: 50000 }))
    ;(db.caseEvidence.findFirst as ReturnType<typeof vi.fn>).mockImplementation((args: { where: { evidenceType: string } }) => {
      if (args.where.evidenceType === 'transaction_history') return Promise.resolve({ payloadJson: { transactions: recentTxns } })
      return Promise.resolve(null)
    })
    const result = await runSignalAgent('case_1', 'run_1')
    expect(result.success).toBe(true)
    expect((result.data as { signals: string[] }).signals).toContain('amount_deviation')
  })

  it('returns failure when case not found', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const result = await runSignalAgent('case_missing', 'run_1')
    expect(result.success).toBe(false)
  })

  it('persists signals to DB', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(makeCase({ amount: 15000, currency: 'EUR' }))
    ;(db.caseEvidence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await runSignalAgent('case_1', 'run_1')
    expect(db.riskSignal.createMany).toHaveBeenCalled()
  })
})
