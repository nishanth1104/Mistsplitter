import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@mistsplitter/audit', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true }),
  AuditActions: { AGENT_COMPLETED: 'agent.completed', AGENT_FAILED: 'agent.failed' },
}))

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      case: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

import { runIntakeAgent } from '../agents/intake.js'
import { writeAuditEvent } from '@mistsplitter/audit'

const BASE_CASE = {
  caseId: 'case_1',
  alertId: 'alert_1',
  status: 'pending',
  priority: 'high',
  correlationId: 'corr_1',
  assignedTo: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  alert: {
    alertId: 'alert_1',
    transactionId: 'txn_1',
    alertType: 'amount_threshold',
    severity: 'high',
    createdAt: new Date(),
  },
}

describe('runIntakeAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns success with alertId and type on valid case', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)

    const result = await runIntakeAgent('case_1', 'run_1')

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      alertId: 'alert_1',
      alertType: 'amount_threshold',
      severity: 'high',
    })
    expect(db.case.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'in_review' } }),
    )
  })

  it('writes audit event on success', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_CASE)

    await runIntakeAgent('case_1', 'run_1')

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.completed', actorId: 'IntakeAgent' }),
    )
  })

  it('returns failure when case not found', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const result = await runIntakeAgent('case_missing', 'run_1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Case not found')
  })

  it('returns failure when no alert linked', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_CASE,
      alert: null,
    })

    const result = await runIntakeAgent('case_1', 'run_1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('No alert')
  })

  it('returns failure when alert missing required fields', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...BASE_CASE,
      alert: { alertId: '', transactionId: '', alertType: '', severity: '' },
    })

    const result = await runIntakeAgent('case_1', 'run_1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('missing required fields')
  })

  it('returns failure when db throws', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'))

    const result = await runIntakeAgent('case_1', 'run_1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('IntakeAgent failed')
  })
})
