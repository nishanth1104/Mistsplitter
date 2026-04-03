import type { ActorType, ActorRole } from '@mistsplitter/core'

export interface Actor {
  type: ActorType
  id: string
  role: ActorRole
  agentId?: string
  correlationId?: string
}

export interface ToolContext {
  actor: Actor
  toolName: string
  caseId?: string
}

export interface McpToolResponse {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/**
 * Parsed actor input from Zod schema — optional fields may be undefined.
 * Convert to Actor using toActor() to satisfy exactOptionalPropertyTypes.
 */
export interface ActorInput {
  type: ActorType
  id: string
  role: ActorRole
  agentId?: string | undefined
  correlationId?: string | undefined
}

/**
 * Convert Zod-parsed ActorInput to Actor, satisfying exactOptionalPropertyTypes.
 * Optional fields are only set if they have non-undefined values.
 */
export function toActor(input: ActorInput): Actor {
  const actor: Actor = {
    type: input.type,
    id: input.id,
    role: input.role,
  }
  if (input.agentId !== undefined) {
    actor.agentId = input.agentId
  }
  if (input.correlationId !== undefined) {
    actor.correlationId = input.correlationId
  }
  return actor
}
