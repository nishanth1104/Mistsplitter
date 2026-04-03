import { z } from 'zod'
import { db, logger } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import type { AgentRegistry } from '@mistsplitter/agents'
import { checkPermission } from '../../permissions.js'
import { toActor } from '../../types.js'
import type { Actor, McpToolResponse } from '../../types.js'

const InputSchema = z.object({
  actor: z.object({
    type: z.enum(['agent', 'reviewer', 'system', 'cli', 'api']),
    id: z.string(),
    role: z.enum(['analyst', 'reviewer', 'manager', 'admin', 'platform-engineer', 'workflow-agent']),
    agentId: z.string().optional(),
    correlationId: z.string().optional(),
  }),
  case_id: z.string(),
  requesting_reviewer_id: z.string(),
  escalation_reason: z.string(),
  target_team: z.string().optional(),
})

export async function handleRequestEscalation(
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

  const { actor: actorInput, case_id, requesting_reviewer_id, escalation_reason, target_team } = parsed.data
  const actor = toActor(actorInput)

  await checkPermission({ actor, toolName: 'request_escalation', caseId: case_id }, registry)

  const caseRecord = await db.case.findUnique({ where: { caseId: case_id } })
  if (!caseRecord) {
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_FAILED,
      payload: { toolName: 'request_escalation', reason: 'Case not found', case_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', case_id }) }],
      isError: true,
    }
  }

  await db.case.update({
    where: { caseId: case_id },
    data: { status: 'escalated' },
  })

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.REVIEW_ESCALATED,
    payload: {
      toolName: 'request_escalation',
      case_id,
      requesting_reviewer_id,
      escalation_reason,
      ...(target_team !== undefined ? { target_team } : {}),
      previous_status: caseRecord.status,
    },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.info({ caseId: case_id, requesting_reviewer_id, actorId: actor.id }, 'request_escalation completed')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          case_id,
          new_status: 'escalated',
          requesting_reviewer_id,
          escalation_reason,
          ...(target_team !== undefined ? { target_team } : {}),
          escalated_at: new Date().toISOString(),
        }),
      },
    ],
  }
}
