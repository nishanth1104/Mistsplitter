import type {
  AccountStatus,
  ActorRole,
  ActorType,
  AgentRiskLevel,
  AgentStatus,
  AlertSeverity,
  AlertType,
  CasePriority,
  CaseStatus,
  ConfidenceLevel,
  CustomerType,
  EvidenceType,
  MerchantRiskTag,
  PolicyDecisionType,
  RecommendedAction,
  ReviewAction,
  RiskReviewState,
  RiskTier,
  TransactionChannel,
  TransactionStatus,
  WorkflowStatus,
} from './enums.js'

export interface Customer {
  customerId: string
  customerType: CustomerType
  country: string // ISO 3166
  riskTier: RiskTier
  name: string
  createdAt: Date
}

export interface Account {
  accountId: string
  customerId: string
  status: AccountStatus
  openedAt: Date
  createdAt: Date
}

export interface Merchant {
  merchantId: string
  name: string
  category: string // MCC code
  country: string
  riskTag: MerchantRiskTag
  createdAt: Date
}

export interface Transaction {
  transactionId: string
  accountId: string
  merchantId: string | null
  amount: string // Decimal as string to avoid floating point
  currency: string
  channel: TransactionChannel
  timestamp: Date
  status: TransactionStatus
  createdAt: Date
}

export interface Alert {
  alertId: string
  transactionId: string
  alertType: AlertType
  severity: AlertSeverity
  createdAt: Date
}

export interface Case {
  caseId: string
  alertId: string
  status: CaseStatus
  priority: CasePriority
  assignedTo: string | null
  correlationId: string
  createdAt: Date
  updatedAt: Date
}

export interface RiskSignal {
  signalId: string
  caseId: string
  signalName: string
  signalValue: string // Decimal as string
  signalReason: string
  createdAt: Date
}

export interface CaseEvidence {
  evidenceId: string
  caseId: string
  evidenceType: EvidenceType
  payloadJson: unknown
  createdAt: Date
}

export interface Recommendation {
  recommendationId: string
  caseId: string
  recommendedAction: RecommendedAction
  summary: string
  confidence: ConfidenceLevel
  evidenceReferences: string[]
  createdAt: Date
}

export interface Review {
  reviewId: string
  caseId: string
  reviewerId: string
  finalAction: ReviewAction
  overrideFlag: boolean
  reasonCode: string | null
  notes: string | null
  reviewedAt: Date
}

export interface AgentRegistry {
  agentId: string
  name: string
  owner: string
  role: string
  status: AgentStatus
  approvedTools: string[]
  allowedActions: string[]
  riskLevel: AgentRiskLevel
  createdAt: Date
}

export interface PolicyEvent {
  policyEventId: string
  caseId: string
  agentId: string
  decision: PolicyDecisionType
  rationale: string
  createdAt: Date
}

export interface AuditLog {
  logId: string
  caseId: string | null
  actorType: ActorType
  actorId: string
  actorRole: ActorRole
  action: string
  payloadJson: unknown
  createdAt: Date
}

export interface WorkflowRun {
  runId: string
  caseId: string
  workflowName: string
  state: RiskReviewState
  startedAt: Date
  endedAt: Date | null
  status: WorkflowStatus
}

export interface MetricsSnapshot {
  snapshotId: string
  metricName: string
  metricValue: string // Decimal as string
  recordedAt: Date
}

// Composite types for API responses
export interface CaseWithAlert extends Case {
  alert: Alert
}

export interface CaseDetail extends Case {
  alert: Alert & { transaction: Transaction & { account: Account & { customer: Customer }; merchant: Merchant | null } }
  recommendation: Recommendation | null
  signals: RiskSignal[]
}
