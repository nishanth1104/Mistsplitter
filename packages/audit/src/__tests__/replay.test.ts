import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      auditLog: {
        findMany: vi.fn(),
      },
    },
  }
})

import { replayCase, getRecentEvents } from '../replay.js'

function makeRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    logId: 'audit_01',
    caseId: 'case_01TEST',
    actorType: 'agent',
    actorId: 'agent_IntakeAgent',
    actorRole: 'workflow-agent',
    action: 'case.created',
    payloadJson: { note: 'test' },
    createdAt: new Date('2026-04-01T10:00:00Z'),
    ...overrides,
  }
}

describe('replayCase()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns events ordered by createdAt asc', async () => {
    const { db } = await import('@mistsplitter/core')
    const records = [
      makeRecord({ logId: 'audit_01', createdAt: new Date('2026-04-01T10:00:00Z'), action: 'workflow.started' }),
      makeRecord({ logId: 'audit_02', createdAt: new Date('2026-04-01T10:01:00Z'), action: 'case.created' }),
      makeRecord({ logId: 'audit_03', createdAt: new Date('2026-04-01T10:02:00Z'), action: 'review.submitted' }),
    ]
    ;(db.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(records)

    const result = await replayCase('case_01TEST')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toHaveLength(3)
      expect(result.value[0]?.action).toBe('workflow.started')
      expect(result.value[2]?.action).toBe('review.submitted')
    }
  })

  it('queries with correct caseId filter', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await replayCase('case_SPECIFIC')
    const call = (db.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.where.caseId).toBe('case_SPECIFIC')
    expect(call.orderBy.createdAt).toBe('asc')
  })

  it('returns empty array when no events exist for case', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const result = await replayCase('case_EMPTY')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toHaveLength(0)
    }
  })

  it('returns err on DB failure', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.auditLog.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Connection lost'),
    )

    const result = await replayCase('case_01TEST')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('AUDIT_READ_FAILED')
    }
  })

  it('maps Prisma records to AuditLog domain type', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeRecord()])

    const result = await replayCase('case_01TEST')
    expect(result.ok).toBe(true)
    if (result.ok) {
      const event = result.value[0]!
      expect(event).toHaveProperty('logId')
      expect(event).toHaveProperty('caseId')
      expect(event).toHaveProperty('actorType')
      expect(event).toHaveProperty('actorRole')
      expect(event).toHaveProperty('action')
      expect(event).toHaveProperty('createdAt')
    }
  })
})

describe('getRecentEvents()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults to limit 100 and desc order', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await getRecentEvents()
    const call = (db.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.take).toBe(100)
    expect(call.orderBy.createdAt).toBe('desc')
  })

  it('clamps limit to max 500', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await getRecentEvents({ limit: 9999 })
    const call = (db.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.take).toBe(500)
  })
})
