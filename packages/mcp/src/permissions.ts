/**
 * MCP Permission Layer — Two-gate permission system.
 *
 * Gate 1: Role matrix check — which roles can call which tools.
 * Gate 2: Agent registry allowlist check — only when actor.type === 'agent'.
 *
 * Both gates must pass before any tool handler executes.
 */

import { PermissionDeniedError, logger } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import { AgentRegistry } from '@mistsplitter/agents'
import type { ActorRole } from '@mistsplitter/core'
import type { ToolContext } from './types.js'

// All 18 tool names
const READ_TOOLS = [
  'get_case',
  'get_alert',
  'get_customer_profile',
  'get_account_context',
  'get_merchant_context',
  'get_recent_transactions',
  'get_prior_alerts',
  'get_prior_reviews',
  'get_case_audit',
] as const

const COMPUTE_TOOLS = [
  'compute_rule_hits',
  'compute_risk_signals',
  'build_evidence_bundle',
  'draft_case_summary',
  'check_policy',
] as const

const REVIEW_ACTION_TOOLS = ['submit_review', 'request_escalation'] as const

const ADMIN_ACTION_TOOLS = ['suspend_agent', 'revoke_agent'] as const

// All roles
const ALL_ROLES: ActorRole[] = ['analyst', 'reviewer', 'manager', 'admin', 'platform-engineer', 'workflow-agent']
const COMPUTE_ROLES: ActorRole[] = ['reviewer', 'manager', 'admin', 'platform-engineer', 'workflow-agent']
const REVIEW_ACTION_ROLES: ActorRole[] = ['reviewer', 'manager', 'admin', 'platform-engineer']
const ADMIN_ROLES: ActorRole[] = ['admin', 'platform-engineer']

/**
 * Tool role matrix — maps each tool name to the set of roles permitted to call it.
 */
export const TOOL_ROLE_MATRIX: Record<string, ActorRole[]> = Object.fromEntries([
  ...READ_TOOLS.map((t) => [t, ALL_ROLES] as [string, ActorRole[]]),
  ...COMPUTE_TOOLS.map((t) => [t, COMPUTE_ROLES] as [string, ActorRole[]]),
  ...REVIEW_ACTION_TOOLS.map((t) => [t, REVIEW_ACTION_ROLES] as [string, ActorRole[]]),
  ...ADMIN_ACTION_TOOLS.map((t) => [t, ADMIN_ROLES] as [string, ActorRole[]]),
])

/**
 * Perform permission check for a tool call.
 * On failure: writes tool.rejected audit event and throws PermissionDeniedError.
 */
export async function checkPermission(
  context: ToolContext,
  registry: AgentRegistry,
): Promise<void> {
  const { actor, toolName, caseId } = context

  // Gate 1: Role matrix check
  const allowedRoles = TOOL_ROLE_MATRIX[toolName]
  if (!allowedRoles) {
    await writeAuditEvent({
      ...(caseId !== undefined ? { caseId } : {}),
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_REJECTED,
      payload: {
        toolName,
        reason: 'Unknown tool',
      },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    throw new PermissionDeniedError(actor.id, toolName, 'Unknown tool')
  }

  if (!allowedRoles.includes(actor.role)) {
    logger.warn({ actor: actor.id, role: actor.role, toolName }, 'Tool call rejected — role not permitted')
    await writeAuditEvent({
      ...(caseId !== undefined ? { caseId } : {}),
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_REJECTED,
      payload: {
        toolName,
        reason: `Role '${actor.role}' not permitted for tool '${toolName}'`,
        allowedRoles,
      },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    throw new PermissionDeniedError(
      actor.id,
      toolName,
      `Role '${actor.role}' is not permitted to call '${toolName}'`,
    )
  }

  // Gate 2: Agent registry allowlist check (only for agents)
  if (actor.type === 'agent' && actor.agentId !== undefined) {
    const agentActor = {
      type: actor.type as 'agent',
      id: actor.id,
      role: actor.role,
      agentId: actor.agentId,
    }
    const result = await registry.checkToolPermission(agentActor, toolName, caseId)
    if (!result.ok) {
      // checkToolPermission already writes the rejection audit event internally
      throw new PermissionDeniedError(
        actor.agentId,
        toolName,
        result.error.message,
      )
    }
  }
}
