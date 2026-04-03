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
  alert_id: z.string(),
})

export async function handleGetAlert(
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

  const { actor: actorInput, alert_id } = parsed.data
  const actor = toActor(actorInput)

  await checkPermission({ actor, toolName: 'get_alert' }, registry)

  const alertRecord = await db.alert.findUnique({
    where: { alertId: alert_id },
    include: {
      transaction: true,
    },
  })

  if (!alertRecord) {
    await writeAuditEvent({
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_FAILED,
      payload: { toolName: 'get_alert', reason: 'Alert not found', alert_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Alert not found', alert_id }) }],
      isError: true,
    }
  }

  await writeAuditEvent({
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.TOOL_CALLED,
    payload: { toolName: 'get_alert', alert_id },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.debug({ alertId: alert_id, actorId: actor.id }, 'get_alert called')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          alertId: alertRecord.alertId,
          transactionId: alertRecord.transactionId,
          alertType: alertRecord.alertType,
          severity: alertRecord.severity,
          createdAt: alertRecord.createdAt.toISOString(),
          transaction: {
            transactionId: alertRecord.transaction.transactionId,
            accountId: alertRecord.transaction.accountId,
            merchantId: alertRecord.transaction.merchantId,
            amount: alertRecord.transaction.amount.toString(),
            currency: alertRecord.transaction.currency,
            channel: alertRecord.transaction.channel,
            timestamp: alertRecord.transaction.timestamp.toISOString(),
            status: alertRecord.transaction.status,
          },
        }),
      },
    ],
  }
}
