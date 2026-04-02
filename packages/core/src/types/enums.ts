// Customer and account enums
export type CustomerType = 'individual' | 'business'
export type RiskTier = 'low' | 'medium' | 'high' | 'pep'
export type AccountStatus = 'active' | 'suspended' | 'closed'

// Transaction enums
export type TransactionChannel = 'card' | 'wire' | 'ach' | 'cash' | 'crypto'
export type TransactionStatus = 'completed' | 'pending' | 'reversed' | 'flagged'
export type Currency = string // ISO 4217

// Merchant enums
export type MerchantRiskTag = 'standard' | 'elevated' | 'restricted'

// Alert enums
export type AlertType =
  | 'amount_threshold'
  | 'velocity'
  | 'pattern'
  | 'merchant_risk'
  | 'rule_hit'

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'

// Case enums
export type CaseStatus =
  | 'pending'
  | 'in_review'
  | 'escalated'
  | 'closed_clear'
  | 'closed_actioned'

export type CasePriority = 'low' | 'medium' | 'high' | 'critical'

// Evidence enums
export type EvidenceType =
  | 'customer_profile'
  | 'account_context'
  | 'transaction_history'
  | 'merchant_context'
  | 'prior_alerts'
  | 'signal_summary'

// Recommendation enums
export type RecommendedAction = 'clear' | 'review_further' | 'escalate'
export type ConfidenceLevel = 'low' | 'medium' | 'high'

// Review enums
export type ReviewAction = 'approved' | 'overridden' | 'escalated' | 'requested_context'

// Agent enums
export type AgentStatus = 'active' | 'suspended' | 'revoked'
export type AgentRiskLevel = 'low' | 'medium' | 'high'

// Policy enums
export type PolicyDecisionType = 'permitted' | 'blocked' | 'requires_approval'

// Audit enums
export type ActorType = 'agent' | 'reviewer' | 'system' | 'cli' | 'api'
export type ActorRole =
  | 'analyst'
  | 'reviewer'
  | 'manager'
  | 'admin'
  | 'platform-engineer'
  | 'workflow-agent'

// Workflow enums
export type WorkflowStatus = 'running' | 'completed' | 'failed' | 'replaying'

export type RiskReviewState =
  | 'pending'
  | 'intake'
  | 'retrieving'
  | 'computing_signals'
  | 'assembling_evidence'
  | 'generating_summary'
  | 'awaiting_policy'
  | 'awaiting_review'
  | 'closed'
  | 'failed'

export type RiskReviewEvent =
  | 'intake_started'
  | 'intake_complete'
  | 'intake_failed'
  | 'retrieval_complete'
  | 'retrieval_failed'
  | 'signals_computed'
  | 'signals_failed'
  | 'evidence_assembled'
  | 'assembly_failed'
  | 'summary_generated'
  | 'summary_failed'
  | 'policy_permitted'
  | 'policy_blocked'
  | 'review_submitted'
  | 'workflow_retried'
