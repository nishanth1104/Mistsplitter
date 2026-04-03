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
  agent_id: z.string(),
  reason: z.string(),
  revoked_by: z.string(),
})

export async function handleRevokeAgent(
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

  const { actor: actorInput, agent_id, reason, revoked_by } = parsed.data
  const actor = toActor(actorInput)

  await checkPermission({ actor, toolName: 'revoke_agent' }, registry)

  const agentRecord = await db.agentRegistry.findUnique({ where: { agentId: agent_id } })
  if (!agentRecord) {
    await writeAuditEvent({
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_FAILED,
      payload: { toolName: 'revoke_agent', reason: 'Agent not found', agent_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Agent not found', agent_id }) }],
      isError: true,
    }
  }

  // Idempotent-blocked: already revoked → error
  if (agentRecord.status === 'revoked') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Agent already revoked',
            agent_id,
            agent_name: agentRecord.name,
          }),
        },
      ],
      isError: true,
    }
  }

  await db.agentRegistry.update({
    where: { agentId: agent_id },
    data: { status: 'revoked' },
  })

  // Invalidate cache
  registry.invalidateCache(agent_id)

  await writeAuditEvent({
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.TOOL_CALLED,
    payload: {
      toolName: 'revoke_agent',
      agent_id,
      agent_name: agentRecord.name,
      reason,
      revoked_by,
      previous_status: agentRecord.status,
    },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.warn({ agentId: agent_id, agentName: agentRecord.name, revokedBy: revoked_by, actorId: actor.id }, 'Agent revoked (irreversible)')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          agent_id,
          agent_name: agentRecord.name,
          new_status: 'revoked',
          reason,
          revoked_by,
          revoked_at: new Date().toISOString(),
        }),
      },
    ],
  }
}
