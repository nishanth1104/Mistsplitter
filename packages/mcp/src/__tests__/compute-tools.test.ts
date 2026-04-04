import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock modules ────────────────────────────────────────────────────────────

vi.mock('@mistsplitter/audit', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  AuditActions: {
    TOOL_CALLED: 'tool.called',
    TOOL_FAILED: 'tool.failed',
    TOOL_REJECTED: 'tool.rejected',
    SUMMARY_GENERATION_STARTED: 'summary.generation.started',
    SUMMARY_GENERATED: 'summary.generated',
    SUMMARY_GENERATION_FAILED: 'summary.generation.failed',
    POLICY_EVALUATED: 'policy.evaluated',
  },
}))

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      case: { findUnique: vi.fn() },
      transaction: { findMany: vi.fn(), count: vi.fn() },
      alert: { count: vi.fn() },
      riskSignal: { create: vi.fn(), findMany: vi.fn() },
      caseEvidence: { findUnique: vi.fn(), create: vi.fn() },
      recommendation: { create: vi.fn() },
      policyEvent: { findFirst: vi.fn() },
    },
    ids: {
      signal: vi.fn().mockReturnValue('signal_abc'),
      evidence: vi.fn().mockReturnValue('evidence_abc'),
      recommendation: vi.fn().mockReturnValue('rec_abc'),
    },
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    getConfig: vi.fn().mockReturnValue({ OPENAI_API_KEY: 'sk-test' }),
    LLMValidationError: actual.LLMValidationError,
  }
})

const mockOpenAICreate = vi.fn()
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockOpenAICreate,
        },
      },
    })),
  }
})

vi.mock('../permissions.js', () => ({
  checkPermission: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@mistsplitter/policy', () => ({
  evaluatePolicy: vi.fn(),
}))

import { handleComputeRuleHits } from '../tools/compute/compute-rule-hits.js'
import { handleDraftCaseSummary } from '../tools/compute/draft-case-summary.js'
import { handleCheckPolicy } from '../tools/compute/check-policy.js'
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

const BASE_TXN = {
  transactionId: 'txn_1',
  accountId: 'acct_1',
  merchantId: 'merchant_1',
  amount: makeDecimal(5000),
  currency: 'USD',
  channel: 'card',
  timestamp: new Date('2024-01-01T12:00:00Z'),
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

const BASE_CASE = {
  caseId: 'case_1',
  alertId: 'alert_1',
  status: 'pending',
  priority: 'high',
  assignedTo: null,
  correlationId: 'corr_1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  alert: {
    alertId: 'alert_1',
    transactionId: 'txn_1',
    alertType: 'amount_threshold',
    severity: 'high',
    createdAt: new Date('2024-01-01'),
    transaction: {
      ...BASE_TXN,
      account: ACCOUNT,
      merchant: {
        merchantId: 'merchant_1',
        name: 'Merchant',
        category: '5411',
        country: 'US',
        riskTag: 'standard',
        createdAt: new Date('2023-01-01'),
      },
    },
  },
  riskSignals: [],
}

describe('compute_rule_hits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenAICreate.mockReset()
  })

  it('does NOT fire HIGH_AMOUNT rule for amount < 10000', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)
    ;(db.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    ;(db.riskSignal.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const result = await handleComputeRuleHits({ actor: makeActor(), case_id: 'case_1' }, makeRegistry() as never)
    const data = JSON.parse(result.content[0]!.text) as { hits: Array<{ ruleName: string }> }
    const hitNames = data.hits.map((h) => h.ruleName)
    expect(hitNames).not.toContain('HIGH_AMOUNT')
  })

  it('fires HIGH_AMOUNT rule for amount > 10000', async () => {
    const { db } = await import('@mistsplitter/core')
    const highAmountCase = {
      ...BASE_CASE,
      alert: {
        ...BASE_CASE.alert,
        transaction: {
          ...BASE_CASE.alert.transaction,
          amount: makeDecimal(15000),
        },
      },
    }
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(highAmountCase)
    ;(db.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    ;(db.riskSignal.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const result = await handleComputeRuleHits({ actor: makeActor(), case_id: 'case_1' }, makeRegistry() as never)
    const data = JSON.parse(result.content[0]!.text) as { hits: Array<{ ruleName: string }> }
    const hitNames = data.hits.map((h) => h.ruleName)
    expect(hitNames).toContain('HIGH_AMOUNT')
  })

  it('fires UNUSUAL_MERCHANT rule for restricted merchant', async () => {
    const { db } = await import('@mistsplitter/core')
    const restrictedCase = {
      ...BASE_CASE,
      alert: {
        ...BASE_CASE.alert,
        transaction: {
          ...BASE_CASE.alert.transaction,
          merchant: { ...BASE_CASE.alert.transaction.merchant, riskTag: 'restricted' },
        },
      },
    }
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(restrictedCase)
    ;(db.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    ;(db.riskSignal.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const result = await handleComputeRuleHits({ actor: makeActor(), case_id: 'case_1' }, makeRegistry() as never)
    const data = JSON.parse(result.content[0]!.text) as { hits: Array<{ ruleName: string }> }
    expect(data.hits.map((h) => h.ruleName)).toContain('UNUSUAL_MERCHANT')
  })

  it('fires ACCOUNT_SUSPENDED rule for suspended account', async () => {
    const { db } = await import('@mistsplitter/core')
    const suspendedCase = {
      ...BASE_CASE,
      alert: {
        ...BASE_CASE.alert,
        transaction: {
          ...BASE_CASE.alert.transaction,
          account: { ...ACCOUNT, status: 'suspended' },
        },
      },
    }
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(suspendedCase)
    ;(db.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    ;(db.riskSignal.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const result = await handleComputeRuleHits({ actor: makeActor(), case_id: 'case_1' }, makeRegistry() as never)
    const data = JSON.parse(result.content[0]!.text) as { hits: Array<{ ruleName: string }> }
    expect(data.hits.map((h) => h.ruleName)).toContain('ACCOUNT_SUSPENDED')
  })

  it('fires HIGH_RISK_CUSTOMER rule for pep customer', async () => {
    const { db } = await import('@mistsplitter/core')
    const pepCase = {
      ...BASE_CASE,
      alert: {
        ...BASE_CASE.alert,
        transaction: {
          ...BASE_CASE.alert.transaction,
          account: {
            ...ACCOUNT,
            customer: { ...ACCOUNT.customer, riskTier: 'pep' },
          },
        },
      },
    }
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(pepCase)
    ;(db.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    ;(db.riskSignal.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const result = await handleComputeRuleHits({ actor: makeActor(), case_id: 'case_1' }, makeRegistry() as never)
    const data = JSON.parse(result.content[0]!.text) as { hits: Array<{ ruleName: string }> }
    expect(data.hits.map((h) => h.ruleName)).toContain('HIGH_RISK_CUSTOMER')
  })

  it('writes risk_signals rows for each hit', async () => {
    const { db } = await import('@mistsplitter/core')
    const highAmountCase = {
      ...BASE_CASE,
      alert: {
        ...BASE_CASE.alert,
        transaction: {
          ...BASE_CASE.alert.transaction,
          amount: makeDecimal(15000),
        },
      },
    }
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(highAmountCase)
    ;(db.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    ;(db.riskSignal.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
    await handleComputeRuleHits({ actor: makeActor(), case_id: 'case_1' }, makeRegistry() as never)
    expect(db.riskSignal.create).toHaveBeenCalled()
  })

  it('returns error for not-found case', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const result = await handleComputeRuleHits({ actor: makeActor(), case_id: 'nope' }, makeRegistry() as never)
    expect(result.isError).toBe(true)
  })
})

describe('draft_case_summary', () => {
  const VALID_BUNDLE = {
    case_id: 'case_1',
    assembled_at: '2024-01-01T00:00:00.000Z',
    composite_risk_score: 50,
    rule_hits: ['HIGH_AMOUNT'],
    top_signals: [{ signalName: 'HIGH_AMOUNT', signalReason: 'Amount exceeded threshold' }],
    recent_event_summary: { transaction_count_30d: 5, avg_amount_30d: 3000, prior_alert_count: 1 },
    policy_references: ['risk_review_standard_v1'],
  }

  const EVIDENCE_RECORD = {
    evidenceId: 'evidence_1',
    caseId: 'case_1',
    evidenceType: 'signal_summary',
    payloadJson: VALID_BUNDLE,
    createdAt: new Date('2024-01-01'),
  }

  const VALID_LLM_RESPONSE = {
    recommended_action: 'review_further',
    summary: 'High-value transaction requiring further review.',
    confidence: 'medium',
    evidence_references: ['HIGH_AMOUNT'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenAICreate.mockReset()
  })

  it('returns recommendation on valid LLM output', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.caseEvidence.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(EVIDENCE_RECORD)
    ;(db.recommendation.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_LLM_RESPONSE) } }],
    })
    const result = await handleDraftCaseSummary(
      { actor: makeActor(), case_id: 'case_1', evidence_id: 'evidence_1' },
      makeRegistry() as never,
    )
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['recommended_action']).toBe('review_further')
  })

  it('returns error and writes SUMMARY_GENERATION_FAILED when LLM output fails Zod validation', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.caseEvidence.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(EVIDENCE_RECORD)
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ recommended_action: 'invalid_value' }) } }],
    })
    const result = await handleDraftCaseSummary(
      { actor: makeActor(), case_id: 'case_1', evidence_id: 'evidence_1' },
      makeRegistry() as never,
    )
    expect(result.isError).toBe(true)
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'summary.generation.failed' }),
    )
  })

  it('returns error and writes SUMMARY_GENERATION_FAILED when LLM output is not JSON', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.caseEvidence.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(EVIDENCE_RECORD)
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: 'not json at all' } }],
    })
    const result = await handleDraftCaseSummary(
      { actor: makeActor(), case_id: 'case_1', evidence_id: 'evidence_1' },
      makeRegistry() as never,
    )
    expect(result.isError).toBe(true)
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'summary.generation.failed' }),
    )
  })

  it('returns error when evidence not found', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.caseEvidence.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const result = await handleDraftCaseSummary(
      { actor: makeActor(), case_id: 'case_1', evidence_id: 'evidence_nope' },
      makeRegistry() as never,
    )
    expect(result.isError).toBe(true)
  })

  it('returns error on LLM API failure', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.caseEvidence.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(EVIDENCE_RECORD)
    mockOpenAICreate.mockRejectedValue(new Error('API error'))
    const result = await handleDraftCaseSummary(
      { actor: makeActor(), case_id: 'case_1', evidence_id: 'evidence_1' },
      makeRegistry() as never,
    )
    expect(result.isError).toBe(true)
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'summary.generation.failed' }),
    )
  })
})

describe('check_policy', () => {
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

  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenAICreate.mockReset()
  })

  it('delegates to evaluatePolicy and returns decision', async () => {
    const { db } = await import('@mistsplitter/core')
    const { evaluatePolicy } = await import('@mistsplitter/policy')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(CASE_RECORD)
    ;(evaluatePolicy as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, value: { decision: 'permitted', rationale: 'All clear' } })
    ;(db.policyEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ policyEventId: 'policy_1' })

    const result = await handleCheckPolicy(
      { actor: makeActor(), case_id: 'case_1', proposed_action: 'clear' },
      makeRegistry() as never,
    )
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['decision']).toBe('permitted')
    expect(evaluatePolicy).toHaveBeenCalledOnce()
  })

  it('returns error when case not found', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const result = await handleCheckPolicy(
      { actor: makeActor(), case_id: 'nope', proposed_action: 'clear' },
      makeRegistry() as never,
    )
    expect(result.isError).toBe(true)
  })

  it('returns error when policy evaluation fails', async () => {
    const { db } = await import('@mistsplitter/core')
    const { evaluatePolicy } = await import('@mistsplitter/policy')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(CASE_RECORD)
    ;(evaluatePolicy as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: { code: 'POLICY_EVAL_FAILED', message: 'Failed' } })
    const result = await handleCheckPolicy(
      { actor: makeActor(), case_id: 'case_1', proposed_action: 'clear' },
      makeRegistry() as never,
    )
    expect(result.isError).toBe(true)
  })
})
