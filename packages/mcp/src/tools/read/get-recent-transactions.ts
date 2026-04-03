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
  days: z.number().int().positive().optional(),
})

export async function handleGetRecentTransactions(
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

  const { actor: actorInput, case_id, limit: rawLimit, days: rawDays } = parsed.data
  const actor = toActor(actorInput)

  // Clamp values
  const limit = Math.min(rawLimit ?? 20, 100)
  const days = Math.min(rawDays ?? 30, 90)

  await checkPermission({ actor, toolName: 'get_recent_transactions', caseId: case_id }, registry)

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
      payload: { toolName: 'get_recent_transactions', reason: 'Case not found', case_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', case_id }) }],
      isError: true,
    }
  }

  const accountId = caseRecord.alert.transaction.accountId
  const since = new Date()
  since.setDate(since.getDate() - days)

  const transactions = await db.transaction.findMany({
    where: {
      accountId,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
  })

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.TOOL_CALLED,
    payload: { toolName: 'get_recent_transactions', case_id, accountId, limit, days, count: transactions.length },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.debug({ caseId: case_id, accountId, count: transactions.length, actorId: actor.id }, 'get_recent_transactions called')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          accountId,
          limit,
          days,
          count: transactions.length,
          transactions: transactions.map((t) => ({
            transactionId: t.transactionId,
            accountId: t.accountId,
            merchantId: t.merchantId,
            amount: t.amount.toString(),
            currency: t.currency,
            channel: t.channel,
            timestamp: t.timestamp.toISOString(),
            status: t.status,
          })),
        }),
      },
    ],
  }
}
