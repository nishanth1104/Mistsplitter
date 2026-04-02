import type { RiskReviewState, RiskReviewEvent, WorkflowStatus } from '@mistsplitter/core'

export interface WorkflowStep {
  name: string
  event: RiskReviewEvent
  agentName: string
  maxRetries?: number
}

export interface StepResult {
  success: boolean
  error?: string
  data?: unknown
}

export interface WorkflowContext {
  runId: string
  caseId: string
  correlationId: string
  workflowName: string
  currentState: RiskReviewState
  startedAt: Date
}

export type WorkflowErrorCode =
  | 'INVALID_STATE_TRANSITION'
  | 'STEP_FAILED'
  | 'STEP_MAX_RETRIES'
  | 'CASE_NOT_FOUND'
  | 'WORKFLOW_ALREADY_RUNNING'

export interface WorkflowError {
  code: WorkflowErrorCode
  message: string
  state?: RiskReviewState
  event?: RiskReviewEvent
}

export interface WorkflowRunRecord {
  runId: string
  caseId: string
  workflowName: string
  state: RiskReviewState
  status: WorkflowStatus
  startedAt: Date
  endedAt?: Date
}
