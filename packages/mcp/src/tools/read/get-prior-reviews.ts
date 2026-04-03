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
  limit: z.number().int().positive().optional(),
})

export async function handleGetPriorReviews(
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

  const { actor: actorInput, case_id, limit: rawLimit } = parsed.data
  const actor = toActor(actorInput)

  const limit = Math.min(rawLimit ?? 10, 20)

  await checkPermission({ actor, toolName: 'get_prior_reviews', caseId: case_id }, registry)

  const caseRecord = await db.case.findUnique({
    where: { caseId: case_id },
    include: {
      alert: {
        include: { transaction: true },
      },
    },
  })

  if (!caseRecord) {
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_FAILED,
      payload: { toolName: 'get_prior_reviews', reason: 'Case not found', case_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', case_id }) }],
      isError: true,
    }
  }

  const accountId = caseRecord.alert.transaction.accountId

  // Find reviews on cases from the same account (excluding current case)
  const priorReviews = await db.review.findMany({
    where: {
      caseId: { not: case_id },
      case: {
        alert: {
          transaction: { accountId },
        },
      },
    },
    orderBy: { reviewedAt: 'desc' },
    take: limit,
    include: {
      case: {
        select: { caseId: true, status: true, priority: true },
      },
    },
  })

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.TOOL_CALLED,
    payload: { toolName: 'get_prior_reviews', case_id, accountId, count: priorReviews.length },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.debug({ caseId: case_id, accountId, count: priorReviews.length, actorId: actor.id }, 'get_prior_reviews called')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          accountId,
          limit,
          count: priorReviews.length,
          reviews: priorReviews.map((r) => ({
            reviewId: r.reviewId,
            caseId: r.caseId,
            reviewerId: r.reviewerId,
            finalAction: r.finalAction,
            overrideFlag: r.overrideFlag,
            reasonCode: r.reasonCode,
            notes: r.notes,
            reviewedAt: r.reviewedAt.toISOString(),
            caseStatus: r.case.status,
            casePriority: r.case.priority,
          })),
        }),
      },
    ],
  }
}
