import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DB
vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      auditLog: {
        create: vi.fn(),
      },
    },
    ids: {
      ...actual.ids,
      auditLog: vi.fn().mockReturnValue('audit_TEST123'),
    },
  }
})

import { writeAuditEvent } from '../logger.js'
import type { AuditEventInput } from '../types.js'

const validEvent: AuditEventInput = {
  caseId: 'case_01TEST',
  actorType: 'agent',
  actorId: 'agent_IntakeAgent',
  actorRole: 'workflow-agent',
  action: 'case.created',
  payload: { caseId: 'case_01TEST' },
}

describe('writeAuditEvent()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an audit log record and returns ok result', async () => {
    const { db } = await import('@mistsplitter/core')
    const mockRecord = {
      logId: 'audit_TEST123',
      caseId: 'case_01TEST',
      actorType: 'agent',
      actorId: 'agent_IntakeAgent',
      actorRole: 'workflow-agent',
      action: 'case.created',
      payloadJson: { caseId: 'case_01TEST' },
      createdAt: new Date(),
    }
    ;(db.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockRecord)

    const result = await writeAuditEvent(validEvent)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.logId).toBe('audit_TEST123')
      expect(result.value.actorType).toBe('agent')
      expect(result.value.action).toBe('case.created')
    }
  })

  it('calls db.auditLog.create with correct fields', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      logId: 'audit_TEST123',
      caseId: 'case_01TEST',
      actorType: 'agent',
      actorId: 'agent_IntakeAgent',
      actorRole: 'workflow-agent',
      action: 'case.created',
      payloadJson: {},
      createdAt: new Date(),
    })

    await writeAuditEvent(validEvent)

    const call = (db.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.data.actorType).toBe('agent')
    expect(call.data.actorRole).toBe('workflow-agent')
    expect(call.data.action).toBe('case.created')
    expect(call.data.caseId).toBe('case_01TEST')
  })

  it('injects correlationId into payload when provided', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      logId: 'audit_TEST123',
      caseId: null,
      actorType: 'system',
      actorId: 'workflow-runtime',
      actorRole: 'workflow-agent',
      action: 'workflow.started',
      payloadJson: {},
      createdAt: new Date(),
    })

    await writeAuditEvent({
      ...validEvent,
      correlationId: 'corr_TESTCORR',
    })

    const call = (db.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.data.payloadJson).toMatchObject({ correlationId: 'corr_TESTCORR' })
  })

  it('handles null caseId for system-level events', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      logId: 'audit_TEST123',
      caseId: null,
      actorType: 'system',
      actorId: 'system',
      actorRole: 'workflow-agent',
      action: 'workflow.started',
      payloadJson: {},
      createdAt: new Date(),
    })

    const result = await writeAuditEvent({
      ...validEvent,
      caseId: null,
    })
    expect(result.ok).toBe(true)

    const call = (db.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.data.caseId).toBeNull()
  })

  it('returns err when DB write fails', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.auditLog.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DB connection lost'),
    )

    const result = await writeAuditEvent(validEvent)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('AUDIT_WRITE_FAILED')
    }
  })

  it('module does NOT export update or delete functions', async () => {
    const auditModule = await import('../logger.js')
    expect(auditModule).not.toHaveProperty('updateAuditEvent')
    expect(auditModule).not.toHaveProperty('deleteAuditEvent')
    expect(auditModule).not.toHaveProperty('update')
    expect(auditModule).not.toHaveProperty('delete')
  })
})
