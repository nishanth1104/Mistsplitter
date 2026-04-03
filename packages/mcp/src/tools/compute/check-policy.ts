import { z } from 'zod'
import { db, logger } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import { evaluatePolicy } from '@mistsplitter/policy'
import type { AgentRegistry } from '@mistsplitter/agents'
import { checkPermission } from '../../permissions.js'
import { toActor } from '../../types.js'
import type { Actor, McpToolResponse } from '../../types.js'
import type { CaseStatus, CasePriority, RecommendedAction } from '@mistsplitter/core'

const InputSchema = z.object({
  actor: z.object({
    type: z.enum(['agent', 'reviewer', 'system', 'cli', 'api']),
    id: z.string(),
    role: z.enum(['analyst', 'reviewer', 'manager', 'admin', 'platform-engineer', 'workflow-agent']),
    agentId: z.string().optional(),
    correlationId: z.string().optional(),
  }),
  case_id: z.string(),
  proposed_action: z.string(),
  agent_id: z.string().optional(),
})

const VALID_RECOMMENDED_ACTIONS = new Set(['clear', 'review_further', 'escalate'])

function toRecommendedAction(s: string): RecommendedAction | undefined {
  if (VALID_RECOMMENDED_ACTIONS.has(s)) return s as RecommendedAction
  return undefined
}

export async function handleCheckPolicy(
  params: Record<string, unknown>,
  registry: AgentRegistry,
): Promise<McpToolResponse> {
  const parsed = InputSchema.safeParse(params)
  if (!parsed.success) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten() }) }],
      isError: true,
    }
  }

  const { actor: actorInput, case_id, proposed_action, agent_id } = parsed.data
  const actor = toActor(actorInput)

  await checkPermission({ actor, toolName: 'check_policy', caseId: case_id }, registry)

  const caseRecord = await db.case.findUnique({ where: { caseId: case_id } })
  if (!caseRecord) {
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_FAILED,
      payload: { toolName: 'check_policy', reason: 'Case not found', case_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', case_id }) }],
      isError: true,
    }
  }

  const recommendedAction = toRecommendedAction(proposed_action)
  const policyResult = await evaluatePolicy({
    caseId: case_id,
    agentId: agent_id ?? actor.id,
    workflowName: 'risk_review',
    caseStatus: caseRecord.status as CaseStatus,
    casePriority: caseRecord.priority as CasePriority,
    ...(recommendedAction !== undefined ? { recommendedAction } : {}),
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  if (!policyResult.ok) {
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_FAILED,
      payload: { toolName: 'check_policy', case_id, reason: policyResult.error.message },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Policy evaluation failed', case_id }) }],
      isError: true,
    }
  }

  const decision = policyResult.value

  // Read the most recently written policy event for this case to get the policy_event_id
  const latestPolicyEvent = await db.policyEvent.findFirst({
    where: { caseId: case_id },
    orderBy: { createdAt: 'desc' },
  })

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.TOOL_CALLED,
    payload: { toolName: 'check_policy', case_id, decision: decision.decision, proposed_action },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.info({ caseId: case_id, decision: decision.decision, actorId: actor.id }, 'check_policy completed')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          policy_event_id: latestPolicyEvent?.policyEventId ?? null,
          decision: decision.decision,
          rationale: decision.rationale,
          ...(decision.requiresApprovalFrom !== undefined ? { requires_approval_from: decision.requiresApprovalFrom } : {}),
          ...(decision.blockedBy !== undefined ? { blocked_by: decision.blockedBy } : {}),
          evaluated_at: new Date().toISOString(),
        }),
      },
    ],
  }
}
