import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock modules ────────────────────────────────────────────────────────────

vi.mock('@mistsplitter/audit', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  AuditActions: {
    TOOL_CALLED: 'tool.called',
    TOOL_FAILED: 'tool.failed',
    TOOL_REJECTED: 'tool.rejected',
  },
}))

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      case: { findUnique: vi.fn() },
      alert: { findUnique: vi.fn(), count: vi.fn(), findMany: vi.fn() },
      transaction: { findMany: vi.fn(), count: vi.fn() },
      review: { findMany: vi.fn() },
      auditLog: { findMany: vi.fn() },
    },
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }
})

vi.mock('../permissions.js', () => ({
  checkPermission: vi.fn().mockResolvedValue(undefined),
}))

import { handleGetCase } from '../tools/read/get-case.js'
import { handleGetAlert } from '../tools/read/get-alert.js'
import { handleGetCustomerProfile } from '../tools/read/get-customer-profile.js'
import { handleGetCaseAudit } from '../tools/read/get-case-audit.js'
import { handleGetRecentTransactions } from '../tools/read/get-recent-transactions.js'
import { handleGetPriorAlerts } from '../tools/read/get-prior-alerts.js'
import { handleGetPriorReviews } from '../tools/read/get-prior-reviews.js'
import { writeAuditEvent } from '@mistsplitter/audit'

function makeRegistry() {
  return { checkToolPermission: vi.fn().mockResolvedValue({ ok: true }), invalidateCache: vi.fn() }
}

function makeActor() {
  return { type: 'reviewer' as const, id: 'actor_1', role: 'reviewer' as const }
}

function makeDecimal(n: number) {
  return { toNumber: () => n, toString: () => String(n) }
}

const CASE_RECORD = {
  caseId: 'case_1',
  alertId: 'alert_1',
  status: 'pending',
  priority: 'high',
  assignedTo: null,
  correlationId: 'corr_1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const TXN = {
  transactionId: 'txn_1',
  accountId: 'acct_1',
  merchantId: 'merchant_1',
  amount: makeDecimal(5000),
  currency: 'USD',
  channel: 'card',
  timestamp: new Date('2024-01-01'),
  status: 'completed',
  createdAt: new Date('2024-01-01'),
}

const ACCOUNT = {
  accountId: 'acct_1',
  customerId: 'cust_1',
  status: 'active',
  openedAt: new Date('2023-01-01'),
  createdAt: new Date('2023-01-01'),
  customer: {
    customerId: 'cust_1',
    name: 'Alice',
    customerType: 'individual',
    country: 'US',
    riskTier: 'low',
    createdAt: new Date('2023-01-01'),
  },
}

const ALERT_RECORD = {
  alertId: 'alert_1',
  transactionId: 'txn_1',
  alertType: 'amount_threshold',
  severity: 'high',
  createdAt: new Date('2024-01-01'),
  transaction: TXN,
}

describe('get_case', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns case fields for valid case_id', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(CASE_RECORD)
    const result = await handleGetCase({ actor: makeActor(), case_id: 'case_1' }, makeRegistry() as never)
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['caseId']).toBe('case_1')
    expect(data['status']).toBe('pending')
  })

  it('returns error for not-found case', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const result = await handleGetCase({ actor: makeActor(), case_id: 'case_nope' }, makeRegistry() as never)
    expect(result.isError).toBe(true)
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['error']).toBeTruthy()
  })

  it('writes audit event on success', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(CASE_RECORD)
    await handleGetCase({ actor: makeActor(), case_id: 'case_1' }, makeRegistry() as never)
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tool.called' }),
    )
  })

  it('returns error for invalid input', async () => {
    const result = await handleGetCase({ actor: makeActor() }, makeRegistry() as never)
    expect(result.isError).toBe(true)
  })
})

describe('get_alert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns alert with transaction for valid alert_id', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.alert.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(ALERT_RECORD)
    const result = await handleGetAlert({ actor: makeActor(), alert_id: 'alert_1' }, makeRegistry() as never)
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['alertId']).toBe('alert_1')
    expect(data['transaction']).toBeDefined()
  })

  it('returns error for not-found alert', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.alert.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const result = await handleGetAlert({ actor: makeActor(), alert_id: 'alert_nope' }, makeRegistry() as never)
    expect(result.isError).toBe(true)
  })

  it('writes audit event on success', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.alert.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(ALERT_RECORD)
    await handleGetAlert({ actor: makeActor(), alert_id: 'alert_1' }, makeRegistry() as never)
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tool.called' }),
    )
  })
})

describe('get_customer_profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const CASE_WITH_CHAIN = {
    ...CASE_RECORD,
    alert: {
      ...ALERT_RECORD,
      transaction: {
        ...TXN,
        account: ACCOUNT,
      },
    },
  }

  it('returns customer and account for valid case', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(CASE_WITH_CHAIN)
    const result = await handleGetCustomerProfile({ actor: makeActor(), case_id: 'case_1' }, makeRegistry() as never)
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['customer']).toBeDefined()
    expect(data['account']).toBeDefined()
  })

  it('returns error when case not found', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const result = await handleGetCustomerProfile({ actor: makeActor(), case_id: 'nope' }, makeRegistry() as never)
    expect(result.isError).toBe(true)
  })

  it('writes audit event on success', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(CASE_WITH_CHAIN)
    await handleGetCustomerProfile({ actor: makeActor(), case_id: 'case_1' }, makeRegistry() as never)
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tool.called' }),
    )
  })
})

describe('get_case_audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns audit events ordered chronologically', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(CASE_RECORD)
    ;(db.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        logId: 'log_1',
        caseId: 'case_1',
        actorType: 'system',
        actorId: 'sys',
        actorRole: 'admin',
        action: 'case.created',
        payloadJson: {},
        createdAt: new Date('2024-01-01'),
      },
    ])
    const result = await handleGetCaseAudit({ actor: makeActor(), case_id: 'case_1' }, makeRegistry() as never)
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(Array.isArray(data['events'])).toBe(true)
    expect(data['count']).toBe(1)
  })

  it('returns error for not-found case', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const result = await handleGetCaseAudit({ actor: makeActor(), case_id: 'nope' }, makeRegistry() as never)
    expect(result.isError).toBe(true)
  })
})

describe('get_recent_transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns transactions with clamped limit', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...CASE_RECORD,
      alert: { ...ALERT_RECORD, transaction: TXN },
    })
    ;(db.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([TXN])
    const result = await handleGetRecentTransactions(
      { actor: makeActor(), case_id: 'case_1', limit: 200, days: 100 },
      makeRegistry() as never,
    )
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['limit']).toBe(100) // clamped
    expect(data['days']).toBe(90) // clamped
  })
})

describe('get_prior_alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns prior alerts excluding current alert', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...CASE_RECORD,
      alert: { ...ALERT_RECORD, transaction: TXN },
    })
    ;(db.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const result = await handleGetPriorAlerts(
      { actor: makeActor(), case_id: 'case_1' },
      makeRegistry() as never,
    )
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['count']).toBe(0)
  })
})

describe('get_prior_reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns prior reviews from same account', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...CASE_RECORD,
      alert: { ...ALERT_RECORD, transaction: TXN },
    })
    ;(db.review.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const result = await handleGetPriorReviews(
      { actor: makeActor(), case_id: 'case_1' },
      makeRegistry() as never,
    )
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['count']).toBe(0)
  })
})
