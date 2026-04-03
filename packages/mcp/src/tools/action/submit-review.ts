import { z } from 'zod'
import { db, ids, logger } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import type { AgentRegistry } from '@mistsplitter/agents'
import { checkPermission } from '../../permissions.js'
import { toActor } from '../../types.js'
import type { Actor, McpToolResponse } from '../../types.js'
import type { CaseStatus } from '@mistsplitter/core'

const InputSchema = z.object({
  actor: z.object({
    type: z.enum(['agent', 'reviewer', 'system', 'cli', 'api']),
    id: z.string(),
    role: z.enum(['analyst', 'reviewer', 'manager', 'admin', 'platform-engineer', 'workflow-agent']),
    agentId: z.string().optional(),
    correlationId: z.string().optional(),
  }),
  case_id: z.string(),
  reviewer_id: z.string(),
  final_action: z.enum(['approved', 'overridden', 'escalated', 'requested_context']),
  override_flag: z.boolean(),
  reason_code: z.string().max(100).optional(),
  notes: z.string().optional(),
})

function toNewCaseStatus(finalAction: string, overrideFlag: boolean): CaseStatus {
  if (finalAction === 'escalated') return 'escalated'
  if (overrideFlag || finalAction === 'overridden') return 'closed_actioned'
  return 'closed_clear'
}

export async function handleSubmitReview(
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

  const { actor: actorInput, case_id, reviewer_id, final_action, override_flag, reason_code, notes } = parsed.data
  const actor = toActor(actorInput)

  await checkPermission({ actor, toolName: 'submit_review', caseId: case_id }, registry)

  // Require reason_code when override_flag is true
  if (override_flag && !reason_code) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'reason_code is required when override_flag is true',
            case_id,
          }),
        },
      ],
      isError: true,
    }
  }

  const caseRecord = await db.case.findUnique({ where: { caseId: case_id } })
  if (!caseRecord) {
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_FAILED,
      payload: { toolName: 'submit_review', reason: 'Case not found', case_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', case_id }) }],
      isError: true,
    }
  }

  const reviewId = ids.review()

  await db.review.create({
    data: {
      reviewId,
      caseId: case_id,
      reviewerId: reviewer_id,
      finalAction: final_action,
      overrideFlag: override_flag,
      ...(reason_code !== undefined ? { reasonCode: reason_code } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  })

  const newStatus = toNewCaseStatus(final_action, override_flag)
  await db.case.update({
    where: { caseId: case_id },
    data: { status: newStatus },
  })

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.REVIEW_SUBMITTED,
    payload: {
      toolName: 'submit_review',
      case_id,
      reviewId,
      reviewer_id,
      final_action,
      override_flag,
      new_status: newStatus,
      ...(reason_code !== undefined ? { reason_code } : {}),
    },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.info({ caseId: case_id, reviewId, final_action, newStatus, actorId: actor.id }, 'submit_review completed')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          review_id: reviewId,
          case_id,
          final_action,
          override_flag,
          new_case_status: newStatus,
          reviewed_at: new Date().toISOString(),
        }),
      },
    ],
  }
}
