-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('individual', 'business');

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('low', 'medium', 'high', 'pep');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "MerchantRiskTag" AS ENUM ('standard', 'elevated', 'restricted');

-- CreateEnum
CREATE TYPE "TransactionChannel" AS ENUM ('card', 'wire', 'ach', 'cash', 'crypto');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('completed', 'pending', 'reversed', 'flagged');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('amount_threshold', 'velocity', 'pattern', 'merchant_risk', 'rule_hit');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('pending', 'in_review', 'escalated', 'closed_clear', 'closed_actioned');

-- CreateEnum
CREATE TYPE "CasePriority" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('customer_profile', 'account_context', 'transaction_history', 'merchant_context', 'prior_alerts', 'signal_summary');

-- CreateEnum
CREATE TYPE "RecommendedAction" AS ENUM ('clear', 'review_further', 'escalate');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('approved', 'overridden', 'escalated', 'requested_context');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('active', 'suspended', 'revoked');

-- CreateEnum
CREATE TYPE "AgentRiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "PolicyDecision" AS ENUM ('permitted', 'blocked', 'requires_approval');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('running', 'completed', 'failed', 'replaying');

-- CreateTable
CREATE TABLE "customers" (
    "customer_id" TEXT NOT NULL,
    "customer_type" "CustomerType" NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "risk_tier" "RiskTier" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "account_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "merchant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "risk_tag" "MerchantRiskTag" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("merchant_id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "transaction_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "merchant_id" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "channel" "TransactionChannel" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "alert_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "alert_type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("alert_id")
);

-- CreateTable
CREATE TABLE "cases" (
    "case_id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'pending',
    "priority" "CasePriority" NOT NULL,
    "assigned_to" TEXT,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("case_id")
);

-- CreateTable
CREATE TABLE "risk_signals" (
    "signal_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "signal_name" TEXT NOT NULL,
    "signal_value" DECIMAL(18,4) NOT NULL,
    "signal_reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_signals_pkey" PRIMARY KEY ("signal_id")
);

-- CreateTable
CREATE TABLE "case_evidence" (
    "evidence_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "evidence_type" "EvidenceType" NOT NULL,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_evidence_pkey" PRIMARY KEY ("evidence_id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "recommendation_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "recommended_action" "RecommendedAction" NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "evidence_references" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("recommendation_id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "review_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "final_action" "ReviewAction" NOT NULL,
    "override_flag" BOOLEAN NOT NULL DEFAULT false,
    "reason_code" VARCHAR(100),
    "notes" TEXT,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("review_id")
);

-- CreateTable
CREATE TABLE "agent_registry" (
    "agent_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'active',
    "approved_tools" TEXT[],
    "allowed_actions" TEXT[],
    "risk_level" "AgentRiskLevel" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_registry_pkey" PRIMARY KEY ("agent_id")
);

-- CreateTable
CREATE TABLE "policy_events" (
    "policy_event_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "decision" "PolicyDecision" NOT NULL,
    "rationale" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_events_pkey" PRIMARY KEY ("policy_event_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "log_id" TEXT NOT NULL,
    "case_id" TEXT,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "run_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "workflow_name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "status" "WorkflowStatus" NOT NULL,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("run_id")
);

-- CreateTable
CREATE TABLE "metrics_snapshots" (
    "snapshot_id" TEXT NOT NULL,
    "metric_name" TEXT NOT NULL,
    "metric_value" DECIMAL(18,4) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_snapshots_pkey" PRIMARY KEY ("snapshot_id")
);

-- CreateIndex
CREATE INDEX "accounts_customer_id_idx" ON "accounts"("customer_id");

-- CreateIndex
CREATE INDEX "transactions_account_id_timestamp_idx" ON "transactions"("account_id", "timestamp");

-- CreateIndex
CREATE INDEX "cases_status_priority_idx" ON "cases"("status", "priority");

-- CreateIndex
CREATE INDEX "risk_signals_case_id_idx" ON "risk_signals"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_registry_name_key" ON "agent_registry"("name");

-- CreateIndex
CREATE INDEX "policy_events_case_id_idx" ON "policy_events"("case_id");

-- CreateIndex
CREATE INDEX "audit_logs_case_id_created_at_idx" ON "audit_logs"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "workflow_runs_case_id_status_idx" ON "workflow_runs"("case_id", "status");

-- CreateIndex
CREATE INDEX "metrics_snapshots_metric_name_recorded_at_idx" ON "metrics_snapshots"("metric_name", "recorded_at");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("merchant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("alert_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("case_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("case_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("case_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("case_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_events" ADD CONSTRAINT "policy_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("case_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_events" ADD CONSTRAINT "policy_events_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_registry"("agent_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("case_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("case_id") ON DELETE RESTRICT ON UPDATE CASCADE;
