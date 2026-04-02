import type { CasePriority, CaseStatus, PolicyDecisionType, RecommendedAction } from '@mistsplitter/core'

export interface PolicyContext {
  caseId: string
  agentId: string
  workflowName: string
  caseStatus: CaseStatus
  casePriority: CasePriority
  recommendedAction?: RecommendedAction
  correlationId?: string
  dryRun?: boolean
}

export interface PolicyDecision {
  decision: PolicyDecisionType
  rationale: string
  requiresApprovalFrom?: string[] // roles that must approve
  blockedBy?: string // rule name that blocked
}

export interface PolicyRule {
  name: string
  description: string
  evaluate(context: PolicyContext): PolicyDecision | null // null = rule does not apply
}

export type PolicyErrorCode = 'POLICY_EVAL_FAILED' | 'AGENT_NOT_FOUND'

export interface PolicyError {
  code: PolicyErrorCode
  message: string
  cause?: unknown
}
