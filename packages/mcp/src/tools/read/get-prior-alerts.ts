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

export async function handleGetPriorAlerts(
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

  const limit = Math.min(rawLimit ?? 10, 50)

  await checkPermission({ actor, toolName: 'get_prior_alerts', caseId: case_id }, registry)

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
      payload: { toolName: 'get_prior_alerts', reason: 'Case not found', case_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', case_id }) }],
      isError: true,
    }
  }

  const currentAlertId = caseRecord.alertId
  const accountId = caseRecord.alert.transaction.accountId

  // Find alerts on same account, excluding the current alert
  const priorAlerts = await db.alert.findMany({
    where: {
      alertId: { not: currentAlertId },
      transaction: { accountId },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { transaction: true },
  })

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.TOOL_CALLED,
    payload: { toolName: 'get_prior_alerts', case_id, accountId, count: priorAlerts.length },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.debug({ caseId: case_id, accountId, count: priorAlerts.length, actorId: actor.id }, 'get_prior_alerts called')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          accountId,
          limit,
          count: priorAlerts.length,
          alerts: priorAlerts.map((a) => ({
            alertId: a.alertId,
            transactionId: a.transactionId,
            alertType: a.alertType,
            severity: a.severity,
            transactionAmount: a.transaction.amount.toString(),
            transactionTimestamp: a.transaction.timestamp.toISOString(),
            createdAt: a.createdAt.toISOString(),
          })),
        }),
      },
    ],
  }
}
