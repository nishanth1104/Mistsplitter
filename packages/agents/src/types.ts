import type { ActorRole } from '@mistsplitter/core'

export interface AgentProfile {
  agentId: string
  name: string
  role: string
  approvedTools: readonly string[]
  allowedActions: readonly string[]
}

export type AgentErrorCode =
  | 'AGENT_NOT_FOUND'
  | 'AGENT_SUSPENDED'
  | 'AGENT_REVOKED'
  | 'TOOL_NOT_PERMITTED'
  | 'REGISTRY_ERROR'

export interface AgentError {
  code: AgentErrorCode
  message: string
  agentId?: string
  toolName?: string
}

export interface Actor {
  type: 'agent' | 'reviewer' | 'system' | 'cli' | 'api'
  id: string
  role: ActorRole
  agentId?: string // populated when type === 'agent'
}
