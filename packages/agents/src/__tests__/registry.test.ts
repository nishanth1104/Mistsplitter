import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AGENT_PROFILES } from '../registry.js'

// Mock DB and audit
vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      agentRegistry: {
        findUnique: vi.fn(),
      },
    },
  }
})

vi.mock('@mistsplitter/audit', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  AuditActions: {
    TOOL_REJECTED: 'tool.rejected',
  },
}))

import { AgentRegistry } from '../registry.js'
import type { Actor } from '../types.js'

function makeActor(agentId: string): Actor {
  return { type: 'agent', id: agentId, role: 'workflow-agent', agentId }
}

function makeAgentRecord(
  name: string,
  status: 'active' | 'suspended' | 'revoked' = 'active',
) {
  const profile = AGENT_PROFILES[name]
  if (!profile) throw new Error(`Unknown agent: ${name}`)
  return {
    agentId: `agent_${name}`,
    name,
    owner: 'platform',
    role: profile.role,
    status,
    approvedTools: [...profile.approvedTools],
    allowedActions: [...profile.allowedActions],
    riskLevel: 'low',
    createdAt: new Date(),
  }
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry

  beforeEach(async () => {
    registry = new AgentRegistry()
    vi.clearAllMocks()
  })

  describe('checkToolPermission() — approved tools', () => {
    it('permits IntakeAgent to call get_alert', async () => {
      const { db } = await import('@mistsplitter/core')
      ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgentRecord('IntakeAgent'),
      )
      const result = await registry.checkToolPermission(
        makeActor('agent_IntakeAgent'),
        'get_alert',
      )
      expect(result.ok).toBe(true)
    })

    it('permits RetrievalAgent to call get_customer_profile', async () => {
      const { db } = await import('@mistsplitter/core')
      ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgentRecord('RetrievalAgent'),
      )
      const result = await registry.checkToolPermission(
        makeActor('agent_RetrievalAgent'),
        'get_customer_profile',
      )
      expect(result.ok).toBe(true)
    })

    it('permits SummaryAgent to call draft_case_summary', async () => {
      const { db } = await import('@mistsplitter/core')
      ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgentRecord('SummaryAgent'),
      )
      const result = await registry.checkToolPermission(
        makeActor('agent_SummaryAgent'),
        'draft_case_summary',
      )
      expect(result.ok).toBe(true)
    })
  })

  describe('checkToolPermission() — blocked tools', () => {
    it('blocks IntakeAgent from calling compute_rule_hits', async () => {
      const { db } = await import('@mistsplitter/core')
      ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgentRecord('IntakeAgent'),
      )
      const result = await registry.checkToolPermission(
        makeActor('agent_IntakeAgent'),
        'compute_rule_hits',
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('TOOL_NOT_PERMITTED')
      }
    })

    it('blocks RetrievalAgent from calling draft_case_summary', async () => {
      const { db } = await import('@mistsplitter/core')
      ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgentRecord('RetrievalAgent'),
      )
      const result = await registry.checkToolPermission(
        makeActor('agent_RetrievalAgent'),
        'draft_case_summary',
      )
      expect(result.ok).toBe(false)
    })

    it('blocks SignalAgent from calling submit_review', async () => {
      const { db } = await import('@mistsplitter/core')
      ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgentRecord('SignalAgent'),
      )
      const result = await registry.checkToolPermission(
        makeActor('agent_SignalAgent'),
        'submit_review',
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('TOOL_NOT_PERMITTED')
        expect(result.error.toolName).toBe('submit_review')
      }
    })

    it('writes a tool.rejected audit event when blocked', async () => {
      const { db } = await import('@mistsplitter/core')
      const { writeAuditEvent } = await import('@mistsplitter/audit')
      ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgentRecord('IntakeAgent'),
      )
      await registry.checkToolPermission(
        makeActor('agent_IntakeAgent'),
        'revoke_agent',
      )
      expect(writeAuditEvent).toHaveBeenCalledOnce()
      const call = (writeAuditEvent as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(call.action).toBe('tool.rejected')
    })
  })

  describe('suspended and revoked agents', () => {
    it('returns AGENT_SUSPENDED for suspended agent', async () => {
      const { db } = await import('@mistsplitter/core')
      ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgentRecord('IntakeAgent', 'suspended'),
      )
      const result = await registry.checkToolPermission(
        makeActor('agent_IntakeAgent'),
        'get_alert',
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('AGENT_SUSPENDED')
    })

    it('returns AGENT_REVOKED for revoked agent', async () => {
      const { db } = await import('@mistsplitter/core')
      ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgentRecord('IntakeAgent', 'revoked'),
      )
      const result = await registry.checkToolPermission(
        makeActor('agent_IntakeAgent'),
        'get_alert',
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('AGENT_REVOKED')
    })
  })

  describe('non-agent actors skip allowlist', () => {
    it('permits reviewer actor without agentId', async () => {
      const actor: Actor = { type: 'reviewer', id: 'reviewer_1', role: 'reviewer' }
      const result = await registry.checkToolPermission(actor, 'any_tool')
      expect(result.ok).toBe(true)
    })
  })

  describe('agent not found', () => {
    it('returns AGENT_NOT_FOUND when agent does not exist in DB', async () => {
      const { db } = await import('@mistsplitter/core')
      ;(db.agentRegistry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      const result = await registry.checkToolPermission(
        makeActor('agent_unknown'),
        'get_alert',
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('AGENT_NOT_FOUND')
    })
  })

  describe('AGENT_PROFILES — all 7 agents defined', () => {
    const expectedAgents = [
      'IntakeAgent',
      'RetrievalAgent',
      'SignalAgent',
      'EvidenceAgent',
      'SummaryAgent',
      'PolicyAgent',
      'ReviewLoggerAgent',
    ]

    for (const name of expectedAgents) {
      it(`${name} has a profile with non-empty approvedTools`, () => {
        expect(AGENT_PROFILES).toHaveProperty(name)
        expect(AGENT_PROFILES[name]?.approvedTools.length).toBeGreaterThan(0)
      })
    }

    it('SummaryAgent can only call draft_case_summary', () => {
      expect(AGENT_PROFILES['SummaryAgent']?.approvedTools).toEqual(['draft_case_summary'])
    })

    it('IntakeAgent cannot call compute or action tools', () => {
      const tools = AGENT_PROFILES['IntakeAgent']?.approvedTools ?? []
      expect(tools).not.toContain('compute_rule_hits')
      expect(tools).not.toContain('submit_review')
    })
  })
})
