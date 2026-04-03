import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock modules ────────────────────────────────────────────────────────────

vi.mock('@mistsplitter/audit', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  AuditActions: {
    TOOL_CALLED: 'tool.called',
    TOOL_FAILED: 'tool.failed',
    TOOL_REJECTED: 'tool.rejected',
    REVIEW_SUBMITTED: 'review.submitted',
    REVIEW_ESCALATED: 'review.escalated',
  },
}))

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      case: { findUnique: vi.fn(), update: vi.fn() },
      review: { create: vi.fn() },
      agentRegistry: { findUnique: vi.fn(), update: vi.fn() },
    },
    ids: {
      review: vi.fn().mockReturnValue('review_abc'),
    },
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    PermissionDeniedError: actual.PermissionDeniedError,
  }
})

vi.mock('../permissions.js', () => ({
  checkPermission: vi.fn().mockResolvedValue(undefined),
}))

import { handleSubmitReview } from '../tools/action/submit-review.js'
import { handleRevokeAgent } from '../tools/action/revoke-agent.js'
import { writeAuditEvent } from '@mistsplitter/audit'
import { PermissionDeniedError } from '@mistsplitter/core'

function makeRegistry() {
  return { checkToolPermission: vi.fn().mockResolvedValue({ ok: true }), invalidateCache: vi.fn() }
}

function makeActor(role: 'reviewer' | 'analyst' | 'admin' | 'platform-engineer' = 'reviewer') {
  return { type: 'reviewer' as const, id: 'actor_1', role }
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

const AGENT_RECORD = {
  agentId: 'agent_1',
  name: 'TestAgent',
  owner: 'platform',
  role: 'intake',
  status: 'active',
  approvedTools: [],
  allowedActions: [],
  riskLevel: 'low',
  createdAt: new Date('2024-01-01'),
}

describe('submit_review', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Ensure checkPermission defaults to allowing calls
    const { checkPermission } = await import('../permissions.js')
    ;(checkPermission as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  })

  it('reviewer can submit an approved review', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(CASE_RECORD)
    ;(db.review.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
    ;(db.case.update as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const result = await handleSubmitReview(
      {
        actor: makeActor('reviewer'),
        case_id: 'case_1',
        reviewer_id: 'rev_1',
        final_action: 'approved',
        override_flag: false,
      },
      makeRegistry() as never,
    )
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['final_action']).toBe('approved')
    expect(data['new_case_status']).toBe('closed_clear')
  })

  it('blocks when analyst role calls submit_review (permission check rejects)', async () => {
    const { checkPermission } = await import('../permissions.js')
    ;(checkPermission as ReturnType<typeof vi.fn>).mockRejectedValue(new PermissionDeniedError('actor_1', 'submit_review', 'Role not permitted'))
    await expect(
      handleSubmitReview(
        {
          actor: makeActor('analyst'),
          case_id: 'case_1',
          reviewer_id: 'rev_1',
          final_action: 'approved',
          override_flag: false,
        },
        makeRegistry() as never,
      ),
    ).rejects.toThrow(PermissionDeniedError)
  })

  it('returns error when override_flag is true and no reason_code', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(CASE_RECORD)
    const result = await handleSubmitReview(
      {
        actor: makeActor('reviewer'),
        case_id: 'case_1',
        reviewer_id: 'rev_1',
        final_action: 'overridden',
        override_flag: true,
      },
      makeRegistry() as never,
    )
    expect(result.isError).toBe(true)
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(String(data['error'])).toMatch(/reason_code/)
  })

  it('succeeds with override and reason_code', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(CASE_RECORD)
    ;(db.review.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
    ;(db.case.update as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const result = await handleSubmitReview(
      {
        actor: makeActor('reviewer'),
        case_id: 'case_1',
        reviewer_id: 'rev_1',
        final_action: 'overridden',
        override_flag: true,
        reason_code: 'RISK_ACCEPTED',
      },
      makeRegistry() as never,
    )
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['new_case_status']).toBe('closed_actioned')
  })

  it('sets new_case_status to escalated for escalated action', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(CASE_RECORD)
    ;(db.review.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
    ;(db.case.update as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const result = await handleSubmitReview(
      {
        actor: makeActor('reviewer'),
        case_id: 'case_1',
        reviewer_id: 'rev_1',
        final_action: 'escalated',
        override_flag: false,
      },
      makeRegistry() as never,
    )
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['new_case_status']).toBe('escalated')
  })

  it('writes REVIEW_SUBMITTED audit event', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(CASE_RECORD)
    ;(db.review.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
    ;(db.case.update as ReturnType<typeof vi.fn>).mockResolvedValue({})
    await handleSubmitReview(
      {
        actor: makeActor('reviewer'),
        case_id: 'case_1',
        reviewer_id: 'rev_1',
        final_action: 'approved',
        override_flag: false,
      },
      makeRegistry() as never,
    )
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'review.submitted' }),
    )
  })

  it('returns error when case not found', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const result = await handleSubmitReview(
      {
        actor: makeActor('reviewer'),
        case_id: 'nope',
        reviewer_id: 'rev_1',
        final_action: 'approved',
        override_flag: false,
      },
      makeRegistry() as never,
    )
    expect(result.isError).toBe(true)
  })
})

describe('revoke_agent', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Ensure checkPermission defaults to allowing calls
    const { checkPermission } = await import('../permissions.js')
    ;(checkPermission as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  })

  it('admin can revoke an active agent', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(AGENT_RECORD)
    ;(db.agentRegistry.update as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const result = await handleRevokeAgent(
      {
        actor: makeActor('admin'),
        agent_id: 'agent_1',
        reason: 'Security breach',
        revoked_by: 'admin_1',
      },
      makeRegistry() as never,
    )
    expect(result.isError).toBeFalsy()
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(data['new_status']).toBe('revoked')
  })

  it('blocks when reviewer role calls revoke_agent (permission check rejects)', async () => {
    const { checkPermission } = await import('../permissions.js')
    ;(checkPermission as ReturnType<typeof vi.fn>).mockRejectedValue(new PermissionDeniedError('actor_1', 'revoke_agent', 'Role not permitted'))
    await expect(
      handleRevokeAgent(
        {
          actor: makeActor('reviewer'),
          agent_id: 'agent_1',
          reason: 'test',
          revoked_by: 'reviewer_1',
        },
        makeRegistry() as never,
      ),
    ).rejects.toThrow(PermissionDeniedError)
  })

  it('returns error if agent already revoked (idempotent block)', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...AGENT_RECORD, status: 'revoked' })
    const result = await handleRevokeAgent(
      {
        actor: makeActor('admin'),
        agent_id: 'agent_1',
        reason: 'test',
        revoked_by: 'admin_1',
      },
      makeRegistry() as never,
    )
    expect(result.isError).toBe(true)
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(String(data['error'])).toMatch(/already revoked/)
  })

  it('does not write agent_registry update when agent already revoked', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...AGENT_RECORD, status: 'revoked' })
    await handleRevokeAgent(
      {
        actor: makeActor('admin'),
        agent_id: 'agent_1',
        reason: 'test',
        revoked_by: 'admin_1',
      },
      makeRegistry() as never,
    )
    expect(db.agentRegistry.update).not.toHaveBeenCalled()
  })

  it('returns error when agent not found', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const result = await handleRevokeAgent(
      {
        actor: makeActor('admin'),
        agent_id: 'nope',
        reason: 'test',
        revoked_by: 'admin_1',
      },
      makeRegistry() as never,
    )
    expect(result.isError).toBe(true)
  })
})
