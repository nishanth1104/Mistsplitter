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

export async function handleGetCaseAudit(
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

  await checkPermission({ actor, toolName: 'get_case_audit', caseId: case_id }, registry)

  const caseRecord = await db.case.findUnique({ where: { caseId: case_id } })
  if (!caseRecord) {
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_FAILED,
      payload: { toolName: 'get_case_audit', reason: 'Case not found', case_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', case_id }) }],
      isError: true,
    }
  }

  const auditLogs = await db.auditLog.findMany({
    where: { caseId: case_id },
    orderBy: { createdAt: 'asc' },
  })

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.TOOL_CALLED,
    payload: { toolName: 'get_case_audit', case_id, count: auditLogs.length },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.debug({ caseId: case_id, count: auditLogs.length, actorId: actor.id }, 'get_case_audit called')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          caseId: case_id,
          count: auditLogs.length,
          events: auditLogs.map((log) => ({
            logId: log.logId,
            actorType: log.actorType,
            actorId: log.actorId,
            actorRole: log.actorRole,
            action: log.action,
            payloadJson: log.payloadJson,
            createdAt: log.createdAt.toISOString(),
          })),
        }),
      },
    ],
  }
}
