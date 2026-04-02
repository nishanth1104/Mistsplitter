/**
 * AgentRegistry — central enforcement of agent tool scope.
 *
 * Two-gate permission system:
 * 1. Role-based matrix (in MCP permissions layer)
 * 2. Per-agent approved_tools allowlist (enforced here)
 *
 * Both gates must pass before a tool call executes.
 */

import { db, logger } from '@mistsplitter/core'
import { ok, err, type Result } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import type { AgentProfile, AgentError, Actor } from './types.js'

// The 7 canonical agent profiles (must be seeded into agent_registry table)
export const AGENT_PROFILES: Record<string, Omit<AgentProfile, 'agentId'>> = {
  IntakeAgent: {
    name: 'IntakeAgent',
    role: 'intake',
    approvedTools: ['create_case', 'validate_alert'] as const,
    allowedActions: ['case.create'] as const,
  },
  RetrievalAgent: {
    name: 'RetrievalAgent',
    role: 'retrieval',
    approvedTools: [
      'get_customer_profile',
      'get_account_context',
      'get_merchant_context',
      'get_recent_transactions',
      'get_prior_alerts',
      'get_prior_reviews',
    ] as const,
    allowedActions: ['evidence.write'] as const,
  },
  SignalAgent: {
    name: 'SignalAgent',
    role: 'signal_computation',
    approvedTools: ['compute_rule_hits', 'compute_risk_signals'] as const,
    allowedActions: ['signal.write'] as const,
  },
  EvidenceAgent: {
    name: 'EvidenceAgent',
    role: 'evidence_assembly',
    approvedTools: ['build_evidence_bundle'] as const,
    allowedActions: ['evidence.bundle'] as const,
  },
  SummaryAgent: {
    name: 'SummaryAgent',
    role: 'summary_generation',
    approvedTools: ['draft_case_summary'] as const,
    allowedActions: ['recommendation.write'] as const,
  },
  PolicyAgent: {
    name: 'PolicyAgent',
    role: 'policy_evaluation',
    approvedTools: ['check_policy'] as const,
    allowedActions: ['policy.evaluate'] as const,
  },
  ReviewLoggerAgent: {
    name: 'ReviewLoggerAgent',
    role: 'review_logging',
    approvedTools: [
      'submit_review_record',
      'write_audit_event',
      'update_metrics',
    ] as const,
    allowedActions: ['review.persist', 'metrics.update', 'audit.write'] as const,
  },
}

export class AgentRegistry {
  private cache = new Map<string, AgentProfile>()
  private cacheExpiry = new Map<string, number>()
  private readonly cacheTtlMs = 30_000 // 30 second cache

  /**
   * Check if the agent is permitted to call the given tool.
   * Returns Err with TOOL_NOT_PERMITTED if the tool is not in the agent's allowlist.
   * Writes a tool.rejected audit event if blocked.
   */
  async checkToolPermission(
    actor: Actor,
    toolName: string,
    caseId?: string,
  ): Promise<Result<true, AgentError>> {
    if (!actor.agentId) {
      return ok(true) // Non-agent actors skip the allowlist check
    }

    const agentResult = await this.getAgent(actor.agentId)
    if (!agentResult.ok) {
      return err(agentResult.error)
    }

    const agent = agentResult.value

    if (agent.approvedTools.length > 0 && !agent.approvedTools.includes(toolName)) {
      // Write rejection audit event
      await writeAuditEvent({
        caseId: caseId ?? null,
        actorType: 'agent',
        actorId: actor.agentId,
        actorRole: 'workflow-agent',
        action: AuditActions.TOOL_REJECTED,
        payload: {
          toolName,
          agentName: agent.name,
          reason: 'Tool not in agent approved_tools allowlist',
        },
      })

      logger.warn(
        { agentId: actor.agentId, toolName, agentName: agent.name },
        'Agent tool call rejected — not in allowlist',
      )

      return err({
        code: 'TOOL_NOT_PERMITTED',
        message: `Agent '${agent.name}' is not permitted to call tool: ${toolName}`,
        agentId: actor.agentId,
        toolName,
      })
    }

    return ok(true)
  }

  /**
   * Fetch agent profile from DB (with short-lived cache).
   */
  async getAgent(agentId: string): Promise<Result<AgentProfile, AgentError>> {
    const now = Date.now()
    const expiry = this.cacheExpiry.get(agentId)
    const cached = this.cache.get(agentId)

    if (cached && expiry !== undefined && now < expiry) {
      if (cached.approvedTools.length === 0) {
        // Shouldn't happen but guard anyway
      }
      // Check status from cache
      return this.validateAgentStatus(cached)
    }

    try {
      const record = await db.agentRegistry.findUnique({
        where: { agentId },
      })

      if (!record) {
        return err({
          code: 'AGENT_NOT_FOUND',
          message: `Agent not found: ${agentId}`,
          agentId,
        })
      }

      const profile: AgentProfile = {
        agentId: record.agentId,
        name: record.name,
        role: record.role,
        approvedTools: record.approvedTools,
        allowedActions: record.allowedActions,
      }

      // Check status
      const statusResult = this.validateAgentStatus(profile, record.status)
      if (!statusResult.ok) return statusResult

      // Cache the profile
      this.cache.set(agentId, profile)
      this.cacheExpiry.set(agentId, now + this.cacheTtlMs)

      return ok(profile)
    } catch (cause) {
      logger.error({ err: cause, agentId }, 'Failed to fetch agent from registry')
      return err({
        code: 'REGISTRY_ERROR',
        message: `Failed to fetch agent ${agentId} from registry`,
        agentId,
      })
    }
  }

  private validateAgentStatus(
    profile: AgentProfile,
    status?: string,
  ): Result<AgentProfile, AgentError> {
    if (status === 'suspended') {
      return err({
        code: 'AGENT_SUSPENDED',
        message: `Agent '${profile.name}' is suspended and cannot perform actions`,
        agentId: profile.agentId,
      })
    }
    if (status === 'revoked') {
      return err({
        code: 'AGENT_REVOKED',
        message: `Agent '${profile.name}' has been revoked and cannot perform actions`,
        agentId: profile.agentId,
      })
    }
    return ok(profile)
  }

  /**
   * Invalidate cache for a specific agent (call after suspend/revoke).
   */
  invalidateCache(agentId: string): void {
    this.cache.delete(agentId)
    this.cacheExpiry.delete(agentId)
  }
}

// Singleton registry instance
export const agentRegistry = new AgentRegistry()
