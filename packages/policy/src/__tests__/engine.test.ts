import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DB and audit before importing engine
vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      policyEvent: {
        create: vi.fn().mockResolvedValue({ policyEventId: 'policy_test' }),
      },
    },
  }
})

vi.mock('@mistsplitter/audit', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  AuditActions: {
    POLICY_EVALUATED: 'policy.evaluated',
    POLICY_BLOCKED: 'policy.blocked',
  },
}))

import { evaluatePolicy } from '../engine.js'
import type { PolicyContext } from '../types.js'

const baseContext: PolicyContext = {
  caseId: 'case_01TEST',
  agentId: 'agent_01TEST',
  workflowName: 'risk_review',
  caseStatus: 'pending',
  casePriority: 'medium',
  recommendedAction: 'review_further',
}

describe('evaluatePolicy()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('dry-run mode', () => {
    it('returns permitted for standard case without writing DB', async () => {
      const { db } = await import('@mistsplitter/core')
      const result = await evaluatePolicy({ ...baseContext, dryRun: true })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.decision).toBe('permitted')
      }
      expect((db.policyEvent.create as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    })

    it('returns requires_approval for critical priority + escalate in dry-run', async () => {
      const { db } = await import('@mistsplitter/core')
      const result = await evaluatePolicy({
        ...baseContext,
        casePriority: 'critical',
        recommendedAction: 'escalate',
        dryRun: true,
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.decision).toBe('requires_approval')
        expect(result.value.requiresApprovalFrom).toContain('manager')
      }
      expect((db.policyEvent.create as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    })
  })

  describe('real evaluation (writes to DB)', () => {
    it('writes a policy_events record on permit', async () => {
      const { db } = await import('@mistsplitter/core')
      const result = await evaluatePolicy({ ...baseContext })
      expect(result.ok).toBe(true)
      expect((db.policyEvent.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce()
    })

    it('blocks and writes policy_event when case status is closed', async () => {
      const { db } = await import('@mistsplitter/core')
      const result = await evaluatePolicy({
        ...baseContext,
        caseStatus: 'closed_clear',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.decision).toBe('blocked')
      }
      expect((db.policyEvent.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce()
    })

    it('returns requires_approval for critical + escalate', async () => {
      const result = await evaluatePolicy({
        ...baseContext,
        casePriority: 'critical',
        recommendedAction: 'escalate',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.decision).toBe('requires_approval')
      }
    })

    it('returns permitted for medium priority case', async () => {
      const result = await evaluatePolicy({ ...baseContext })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.decision).toBe('permitted')
      }
    })
  })

  describe('decision outcomes', () => {
    it('all possible decisions are returned correctly', async () => {
      const permitted = await evaluatePolicy({ ...baseContext, dryRun: true })
      expect(permitted.ok && permitted.value.decision).toBe('permitted')

      const blocked = await evaluatePolicy({
        ...baseContext,
        caseStatus: 'closed_actioned',
        dryRun: true,
      })
      expect(blocked.ok && blocked.value.decision).toBe('blocked')

      const requiresApproval = await evaluatePolicy({
        ...baseContext,
        casePriority: 'critical',
        recommendedAction: 'escalate',
        dryRun: true,
      })
      expect(requiresApproval.ok && requiresApproval.value.decision).toBe('requires_approval')
    })
  })
})
