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

export async function handleGetCustomerProfile(
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

  await checkPermission({ actor, toolName: 'get_customer_profile', caseId: case_id }, registry)

  // Resolve chain: case → alert → transaction → account → customer
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
      payload: { toolName: 'get_customer_profile', reason: 'Case not found', case_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', case_id }) }],
      isError: true,
    }
  }

  const { customer, ...account } = caseRecord.alert.transaction.account

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.TOOL_CALLED,
    payload: { toolName: 'get_customer_profile', case_id, customerId: customer.customerId },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.debug({ caseId: case_id, customerId: customer.customerId, actorId: actor.id }, 'get_customer_profile called')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          customer: {
            customerId: customer.customerId,
            name: customer.name,
            customerType: customer.customerType,
            country: customer.country,
            riskTier: customer.riskTier,
            createdAt: customer.createdAt.toISOString(),
          },
          account: {
            accountId: account.accountId,
            customerId: account.customerId,
            status: account.status,
            openedAt: account.openedAt.toISOString(),
            createdAt: account.createdAt.toISOString(),
          },
        }),
      },
    ],
  }
}
