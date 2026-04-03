// TypeScript types mirroring the API response shapes

export type CaseStatus = 'pending' | 'in_review' | 'escalated' | 'closed_clear' | 'closed_actioned'
export type CasePriority = 'low' | 'medium' | 'high' | 'critical'
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'
export type AgentStatus = 'active' | 'suspended' | 'revoked'
export type ReviewAction = 'approved' | 'overridden' | 'escalated' | 'requested_context'
export type RecommendedAction = 'clear' | 'review_further' | 'escalate'

export interface AlertRow {
  alertId: string
  transactionId: string
  alertType: string
  severity: AlertSeverity
  createdAt: string
  transaction?: {
    transactionId: string
    amount: string
    currency: string
    channel: string
    timestamp: string
    status: string
  }
}

export interface RecommendationRow {
  recommendationId: string
  caseId: string
  recommendedAction: RecommendedAction
  summary: string
  confidence: string
  evidenceReferences: string[]
  createdAt: string
}

export interface ReviewRow {
  reviewId: string
  caseId: string
  reviewerId: string
  finalAction: ReviewAction
  overrideFlag: boolean
  reasonCode: string | null
  notes: string | null
  reviewedAt: string
}

export interface WorkflowRunRow {
  runId: string
  caseId: string
  workflowName: string
  state: string
  status: string
  startedAt: string
  endedAt: string | null
}

export interface CaseListItem {
  caseId: string
  alertId: string
  status: CaseStatus
  priority: CasePriority
  assignedTo: string | null
  correlationId: string
  createdAt: string
  updatedAt: string
  alert: AlertRow
  recommendations: RecommendationRow[]
  workflowRuns: WorkflowRunRow[]
}

export interface CaseDetail {
  case: CaseListItem & {
    reviews: ReviewRow[]
  }
}

export interface CaseListResponse {
  cases: CaseListItem[]
  total: number
  limit: number
  offset: number
}

export interface AgentRow {
  agentId: string
  name: string
  owner: string
  role: string
  status: AgentStatus
  approvedTools: string[]
  allowedActions: string[]
  riskLevel: string
  createdAt: string
}

export interface AgentListResponse {
  agents: AgentRow[]
  total: number
}

export interface AuditLogRow {
  logId: string
  caseId: string | null
  actorType: string
  actorId: string
  actorRole: string
  action: string
  payloadJson: Record<string, unknown>
  createdAt: string
}

export interface AuditLogResponse {
  logs: AuditLogRow[]
  total: number
  limit: number
  offset: number
}

export interface MetricRow {
  metricName: string
  metricValue: string
  recordedAt: string
}

export interface MetricsResponse {
  metrics: MetricRow[]
}
