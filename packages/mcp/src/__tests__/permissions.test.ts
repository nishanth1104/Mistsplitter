import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock audit before importing permissions
vi.mock('@mistsplitter/audit', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  AuditActions: {
    TOOL_REJECTED: 'tool.rejected',
    TOOL_CALLED: 'tool.called',
    TOOL_FAILED: 'tool.failed',
  },
}))

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }
})

import { checkPermission, TOOL_ROLE_MATRIX } from '../permissions.js'
import { writeAuditEvent } from '@mistsplitter/audit'
import { PermissionDeniedError } from '@mistsplitter/core'
import type { ActorRole } from '@mistsplitter/core'
import type { ToolContext } from '../types.js'

function makeRegistry(checkResult: { ok: true } | { ok: false; error: { message: string } } = { ok: true }) {
  return {
    checkToolPermission: vi.fn().mockResolvedValue(checkResult),
    getAgent: vi.fn(),
    invalidateCache: vi.fn(),
  }
}

function makeContext(role: ActorRole, toolName: string, type: 'agent' | 'reviewer' | 'system' | 'cli' | 'api' = 'reviewer'): ToolContext {
  return {
    actor: { type, id: 'actor_1', role },
    toolName,
  }
}

const ALL_ROLES: ActorRole[] = ['analyst', 'reviewer', 'manager', 'admin', 'platform-engineer', 'workflow-agent']

describe('TOOL_ROLE_MATRIX', () => {
  it('covers all 18 tools', () => {
    const expectedTools = [
      'get_case', 'get_alert', 'get_customer_profile', 'get_account_context',
      'get_merchant_context', 'get_recent_transactions', 'get_prior_alerts',
      'get_prior_reviews', 'get_case_audit',
      'compute_rule_hits', 'compute_risk_signals', 'build_evidence_bundle',
      'draft_case_summary', 'check_policy',
      'submit_review', 'request_escalation',
      'suspend_agent', 'revoke_agent',
    ]
    for (const tool of expectedTools) {
      expect(TOOL_ROLE_MATRIX[tool]).toBeDefined()
    }
  })

  it('read tools allow all 6 roles', () => {
    const readTools = ['get_case', 'get_alert', 'get_customer_profile', 'get_account_context',
      'get_merchant_context', 'get_recent_transactions', 'get_prior_alerts', 'get_prior_reviews', 'get_case_audit']
    for (const tool of readTools) {
      for (const role of ALL_ROLES) {
        expect(TOOL_ROLE_MATRIX[tool]).toContain(role)
      }
    }
  })

  it('compute tools reject analyst role', () => {
    const computeTools = ['compute_rule_hits', 'compute_risk_signals', 'build_evidence_bundle', 'draft_case_summary', 'check_policy']
    for (const tool of computeTools) {
      expect(TOOL_ROLE_MATRIX[tool]).not.toContain('analyst')
    }
  })

  it('compute tools allow workflow-agent', () => {
    const computeTools = ['compute_rule_hits', 'compute_risk_signals', 'build_evidence_bundle', 'draft_case_summary', 'check_policy']
    for (const tool of computeTools) {
      expect(TOOL_ROLE_MATRIX[tool]).toContain('workflow-agent')
    }
  })

  it('action tools (submit_review, request_escalation) reject analyst and workflow-agent', () => {
    const actionTools = ['submit_review', 'request_escalation']
    for (const tool of actionTools) {
      expect(TOOL_ROLE_MATRIX[tool]).not.toContain('analyst')
      expect(TOOL_ROLE_MATRIX[tool]).not.toContain('workflow-agent')
    }
  })

  it('action tools (submit_review, request_escalation) allow reviewer, manager, admin, platform-engineer', () => {
    const actionTools = ['submit_review', 'request_escalation']
    const allowed: ActorRole[] = ['reviewer', 'manager', 'admin', 'platform-engineer']
    for (const tool of actionTools) {
      for (const role of allowed) {
        expect(TOOL_ROLE_MATRIX[tool]).toContain(role)
      }
    }
  })

  it('admin-only tools only allow admin and platform-engineer', () => {
    const adminTools = ['suspend_agent', 'revoke_agent']
    for (const tool of adminTools) {
      expect(TOOL_ROLE_MATRIX[tool]).toContain('admin')
      expect(TOOL_ROLE_MATRIX[tool]).toContain('platform-engineer')
      expect(TOOL_ROLE_MATRIX[tool]).not.toContain('analyst')
      expect(TOOL_ROLE_MATRIX[tool]).not.toContain('reviewer')
      expect(TOOL_ROLE_MATRIX[tool]).not.toContain('manager')
      expect(TOOL_ROLE_MATRIX[tool]).not.toContain('workflow-agent')
    }
  })
})

describe('checkPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes for allowed role on read tool', async () => {
    const registry = makeRegistry()
    const context = makeContext('analyst', 'get_case')
    await expect(checkPermission(context, registry as never)).resolves.toBeUndefined()
  })

  it('throws PermissionDeniedError for analyst on compute tool', async () => {
    const registry = makeRegistry()
    const context = makeContext('analyst', 'compute_rule_hits')
    await expect(checkPermission(context, registry as never)).rejects.toThrow(PermissionDeniedError)
  })

  it('writes tool.rejected audit event when role is denied', async () => {
    const registry = makeRegistry()
    const context = makeContext('analyst', 'suspend_agent')
    await expect(checkPermission(context, registry as never)).rejects.toThrow(PermissionDeniedError)
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tool.rejected' }),
    )
  })

  it('throws for unknown tool', async () => {
    const registry = makeRegistry()
    const context = makeContext('admin', 'nonexistent_tool')
    await expect(checkPermission(context, registry as never)).rejects.toThrow(PermissionDeniedError)
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tool.rejected' }),
    )
  })

  it('calls registry.checkToolPermission for agent actors', async () => {
    const registry = makeRegistry()
    const context: ToolContext = {
      actor: { type: 'agent', id: 'agent_1', role: 'workflow-agent', agentId: 'agent_123' },
      toolName: 'compute_rule_hits',
    }
    await checkPermission(context, registry as never)
    expect(registry.checkToolPermission).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent_123' }),
      'compute_rule_hits',
      undefined,
    )
  })

  it('throws when agent registry check fails', async () => {
    const registry = makeRegistry({ ok: false, error: { message: 'Tool not permitted' } })
    const context: ToolContext = {
      actor: { type: 'agent', id: 'agent_1', role: 'workflow-agent', agentId: 'agent_123' },
      toolName: 'compute_rule_hits',
    }
    await expect(checkPermission(context, registry as never)).rejects.toThrow(PermissionDeniedError)
  })

  it('skips registry check for non-agent actors', async () => {
    const registry = makeRegistry()
    const context = makeContext('reviewer', 'get_case', 'reviewer')
    await checkPermission(context, registry as never)
    expect(registry.checkToolPermission).not.toHaveBeenCalled()
  })
})
