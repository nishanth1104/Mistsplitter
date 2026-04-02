import type { ActorRole, ActorType } from '@mistsplitter/core'

export interface AuditEventInput {
  caseId?: string | null
  actorType: ActorType
  actorId: string
  actorRole: ActorRole
  action: string
  payload: Record<string, unknown>
  correlationId?: string
}

export type AuditErrorCode =
  | 'AUDIT_WRITE_FAILED'
  | 'AUDIT_READ_FAILED'
  | 'CASE_NOT_FOUND'

export interface AuditError {
  code: AuditErrorCode
  message: string
  cause?: unknown
}

// Standard audit action strings
export const AuditActions = {
  // Alert lifecycle
  ALERT_RECEIVED: 'alert.received',
  // Case lifecycle
  CASE_CREATED: 'case.created',
  CASE_STATUS_CHANGED: 'case.status_changed',
  CASE_ASSIGNED: 'case.assigned',
  CASE_CLOSED: 'case.closed',
  // Agent actions
  AGENT_INVOKED: 'agent.invoked',
  AGENT_COMPLETED: 'agent.completed',
  AGENT_FAILED: 'agent.failed',
  // Tool actions
  TOOL_CALLED: 'tool.called',
  TOOL_REJECTED: 'tool.rejected',
  TOOL_FAILED: 'tool.failed',
  // Summary
  SUMMARY_GENERATION_STARTED: 'summary.generation.started',
  SUMMARY_GENERATED: 'summary.generated',
  SUMMARY_GENERATION_FAILED: 'summary.generation.failed',
  // Policy
  POLICY_EVALUATED: 'policy.evaluated',
  POLICY_BLOCKED: 'policy.blocked',
  // Review
  REVIEW_SUBMITTED: 'review.submitted',
  REVIEW_OVERRIDDEN: 'review.overridden',
  REVIEW_ESCALATED: 'review.escalated',
  // Workflow
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED: 'workflow.failed',
  WORKFLOW_REPLAYING: 'workflow.replaying',
  // Access control
  ACCESS_DENIED: 'access.denied',
} as const

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions]
