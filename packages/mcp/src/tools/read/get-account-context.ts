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
})

export async function handleGetAccountContext(
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

  const { actor: actorInput, case_id } = parsed.data
  const actor = toActor(actorInput)

  await checkPermission({ actor, toolName: 'get_account_context', caseId: case_id }, registry)

  const caseRecord = await db.case.findUnique({
    where: { caseId: case_id },
    include: {
      alert: {
        include: {
          transaction: {
            include: {
              account: {
                include: { customer: true },
              },
            },
          },
        },
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
      payload: { toolName: 'get_account_context', reason: 'Case not found', case_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', case_id }) }],
      isError: true,
    }
  }

  const account = caseRecord.alert.transaction.account
  const accountId = account.accountId

  // Count and avg amount for transactions in last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const recentTransactions = await db.transaction.findMany({
    where: {
      accountId,
      timestamp: { gte: thirtyDaysAgo },
    },
    select: { amount: true },
  })

  const transactionCount30d = recentTransactions.length
  const avgAmount30d =
    transactionCount30d > 0
      ? recentTransactions.reduce((sum, t) => sum + t.amount.toNumber(), 0) / transactionCount30d
      : 0

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.TOOL_CALLED,
    payload: { toolName: 'get_account_context', case_id, accountId },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.debug({ caseId: case_id, accountId, actorId: actor.id }, 'get_account_context called')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          account: {
            accountId: account.accountId,
            customerId: account.customerId,
            status: account.status,
            openedAt: account.openedAt.toISOString(),
            createdAt: account.createdAt.toISOString(),
          },
          customer: {
            customerId: account.customer.customerId,
            name: account.customer.name,
            riskTier: account.customer.riskTier,
          },
          transactionSummary: {
            transactionCount30d,
            avgAmount30d: Math.round(avgAmount30d * 100) / 100,
          },
        }),
      },
    ],
  }
}
