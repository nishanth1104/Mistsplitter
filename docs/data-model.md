# Mistsplitter — Data Model

Prisma schema lives at `packages/core/prisma/schema.prisma`.

---

## Entity Relationship Overview

```
customers
    └──▶ accounts
              └──▶ transactions ──▶ alerts ──▶ cases
                                                  ├──▶ risk_signals
                                                  ├──▶ case_evidence
                                                  ├──▶ recommendations
                                                  ├──▶ reviews
                                                  ├──▶ policy_events
                                                  ├──▶ audit_logs
                                                  └──▶ workflow_runs

merchants ──▶ transactions

agent_registry (standalone — not case-scoped)
metrics_snapshots (standalone — time-series)
```

---

## Tables

### customers
Represents an individual or business with financial accounts.

| Column | Type | Notes |
|---|---|---|
| customer_id | String (ULID) | PK |
| customer_type | Enum | `individual`, `business` |
| country | String | ISO 3166-1 alpha-2 |
| risk_tier | Enum | `low`, `medium`, `high`, `pep` |
| created_at | DateTime | |

**Domain notes:**
- `pep` = Politically Exposed Person — always elevated AML scrutiny
- `risk_tier` is set at onboarding and updated by KYC reviews
- Country is used for jurisdiction-based rule evaluation

---

### accounts
Financial accounts owned by a customer.

| Column | Type | Notes |
|---|---|---|
| account_id | String (ULID) | PK |
| customer_id | String | FK → customers |
| status | Enum | `active`, `suspended`, `closed` |
| opened_at | DateTime | |
| created_at | DateTime | |

---

### merchants
Counterparty merchants in transactions.

| Column | Type | Notes |
|---|---|---|
| merchant_id | String (ULID) | PK |
| category | String | MCC-style category code |
| country | String | ISO 3166-1 alpha-2 |
| risk_tag | Enum | `standard`, `elevated`, `restricted` |
| created_at | DateTime | |

**Domain notes:**
- `risk_tag` of `restricted` means any transaction triggers heightened review
- Merchant category codes (MCC) inform signal computation (e.g., gambling, crypto, wire transfers)

---

### transactions
Individual financial transactions.

| Column | Type | Notes |
|---|---|---|
| transaction_id | String (ULID) | PK |
| account_id | String | FK → accounts |
| merchant_id | String | FK → merchants |
| amount | Decimal | Always positive; direction indicated by type |
| currency | String | ISO 4217 (e.g., USD, GBP, EUR) |
| channel | Enum | `card`, `wire`, `ach`, `cash`, `crypto` |
| timestamp | DateTime | When transaction occurred |
| status | Enum | `completed`, `pending`, `reversed`, `flagged` |
| created_at | DateTime | |

**Domain notes:**
- `channel` is a significant risk signal (wire + high amount = elevated risk)
- `status = flagged` means system has identified this for review
- Amount stored as Decimal to avoid floating-point issues

---

### alerts
System-generated flags on transactions requiring human or agent review.

| Column | Type | Notes |
|---|---|---|
| alert_id | String (ULID) | PK |
| transaction_id | String | FK → transactions |
| alert_type | Enum | `amount_threshold`, `velocity`, `pattern`, `merchant_risk`, `rule_hit` |
| severity | Enum | `low`, `medium`, `high`, `critical` |
| created_at | DateTime | |

**Domain notes:**
- An alert is the entry point. Every case starts from an alert.
- `severity` drives initial case priority

---

### cases
The governed review unit — created from an alert, carries state through the full workflow.

| Column | Type | Notes |
|---|---|---|
| case_id | String (ULID) | PK |
| alert_id | String | FK → alerts |
| status | Enum | `pending`, `in_review`, `escalated`, `closed_clear`, `closed_actioned` |
| priority | Enum | `low`, `medium`, `high`, `critical` |
| assigned_to | String? | Reviewer user ID (nullable until assigned) |
| correlation_id | String (ULID) | Ties all workflow events together |
| created_at | DateTime | |
| updated_at | DateTime | |

---

### risk_signals
Individual computed risk indicators attached to a case.

| Column | Type | Notes |
|---|---|---|
| signal_id | String (ULID) | PK |
| case_id | String | FK → cases |
| signal_name | String | e.g., `amount_deviation_3sigma`, `high_velocity_24h`, `restricted_merchant` |
| signal_value | String | JSON-encoded value or numeric string |
| signal_reason | String | Human-readable explanation |
| created_at | DateTime | |

**Common signal names:**
- `amount_deviation_3sigma` — transaction amount > 3 standard deviations from account mean
- `high_velocity_24h` — more than N transactions in 24 hours
- `restricted_merchant_category` — merchant MCC is in restricted list
- `cross_border_wire` — wire transfer to a foreign account
- `new_merchant_high_amount` — first transaction with this merchant, high amount
- `prior_alert_pattern` — customer has prior alerts of similar type

---

### case_evidence
Structured evidence bundle assembled for a case.

| Column | Type | Notes |
|---|---|---|
| evidence_id | String (ULID) | PK |
| case_id | String | FK → cases |
| evidence_type | Enum | `customer_profile`, `account_context`, `transaction_history`, `merchant_context`, `prior_alerts`, `signal_summary` |
| payload_json | Json | Structured evidence payload |
| created_at | DateTime | |

---

### recommendations
Agent-generated recommendation for a case.

| Column | Type | Notes |
|---|---|---|
| recommendation_id | String (ULID) | PK |
| case_id | String | FK → cases |
| recommended_action | Enum | `clear`, `review_further`, `escalate` |
| summary | String | Narrative summary generated by SummaryAgent |
| confidence | Enum | `low`, `medium`, `high` |
| created_at | DateTime | |

**Domain notes:**
- `summary` is generated by LLM (SummaryAgent) from structured evidence only
- `confidence` reflects signal strength, not LLM certainty
- A case may have multiple recommendation records if context is re-run

---

### reviews
Final human reviewer action on a case.

| Column | Type | Notes |
|---|---|---|
| review_id | String (ULID) | PK |
| case_id | String | FK → cases |
| reviewer_id | String | Actor who performed the review |
| final_action | Enum | `approved`, `overridden`, `escalated`, `requested_context` |
| override_flag | Boolean | True if reviewer disagreed with recommendation |
| reason_code | String? | Required when override_flag is true |
| notes | String? | Optional free-text annotation |
| reviewed_at | DateTime | |

**Common reason codes:**
- `KNOWN_CUSTOMER_PATTERN` — reviewer knows this is expected behavior
- `FALSE_POSITIVE_VELOCITY` — velocity spike explained by known event
- `INSUFFICIENT_EVIDENCE` — not enough evidence to act
- `ESCALATE_AML_TEAM` — requires specialist review
- `SAR_FILING_REQUIRED` — suspicious activity report to be filed

---

### agent_registry
Registry of all agents in the system with their scopes and status.

| Column | Type | Notes |
|---|---|---|
| agent_id | String (ULID) | PK |
| name | String | e.g., `IntakeAgent`, `SummaryAgent` |
| owner | String | Team or system that owns this agent |
| role | String | Functional role |
| status | Enum | `active`, `suspended`, `revoked` |
| approved_tools | String[] | Allowlist of MCP tool names |
| allowed_actions | String[] | Allowlist of action-tier operations |
| risk_level | Enum | `low`, `medium`, `high` |
| created_at | DateTime | |

---

### policy_events
Record of every policy engine evaluation.

| Column | Type | Notes |
|---|---|---|
| policy_event_id | String (ULID) | PK |
| case_id | String | FK → cases |
| agent_id | String | Which agent triggered the check |
| decision | Enum | `permitted`, `blocked`, `requires_approval` |
| rationale | String | Why the decision was made |
| created_at | DateTime | |

---

### audit_logs
Append-only record of every meaningful system event.

| Column | Type | Notes |
|---|---|---|
| log_id | String (ULID) | PK |
| case_id | String? | FK → cases (nullable for non-case events) |
| actor_type | Enum | `agent`, `reviewer`, `system`, `cli`, `api` |
| actor_id | String | Identity of the actor |
| action | String | e.g., `case.created`, `tool.called`, `review.submitted` |
| payload_json | Json | Full context of the event |
| created_at | DateTime | |

**Important:** This table is append-only. No update or delete operations are permitted in application code.

**Standard action strings:**
- `alert.received`
- `case.created`
- `agent.invoked`
- `tool.called`
- `tool.rejected`
- `policy.evaluated`
- `evidence.assembled`
- `summary.generated`
- `review.submitted`
- `review.overridden`
- `case.escalated`
- `case.closed`
- `agent.suspended`
- `agent.revoked`

---

### workflow_runs
Tracks execution of a workflow instance.

| Column | Type | Notes |
|---|---|---|
| run_id | String (ULID) | PK |
| case_id | String | FK → cases |
| workflow_name | String | e.g., `risk_review` |
| state | String | Current state in state machine |
| started_at | DateTime | |
| ended_at | DateTime? | Null if still running |
| status | Enum | `running`, `completed`, `failed`, `replaying` |

---

### metrics_snapshots
Time-series snapshots of platform metrics.

| Column | Type | Notes |
|---|---|---|
| snapshot_id | String (ULID) | PK |
| metric_name | String | e.g., `queue_backlog`, `override_rate`, `avg_review_time_seconds` |
| metric_value | Decimal | |
| recorded_at | DateTime | |

---

## Indexes to Create

```sql
-- Cases by status and priority (queue view)
CREATE INDEX idx_cases_status_priority ON cases(status, priority, created_at DESC);

-- Audit log lookup by case
CREATE INDEX idx_audit_logs_case_id ON audit_logs(case_id, created_at ASC);

-- Workflow runs by case
CREATE INDEX idx_workflow_runs_case_id ON workflow_runs(case_id);

-- Signals by case
CREATE INDEX idx_risk_signals_case_id ON risk_signals(case_id);

-- Policy events by case
CREATE INDEX idx_policy_events_case_id ON policy_events(case_id, created_at ASC);
```

---

## Seeding Strategy

Synthetic data should feel realistic. Seed in this order:

1. `merchants` — 50–100 with mix of risk_tags and categories
2. `customers` — 200–500 with mix of risk_tiers and countries
3. `accounts` — 1–3 per customer
4. `transactions` — 10–100 per account, realistic amounts and channels
5. `alerts` — select subset of transactions, vary severity
6. `cases` — one per alert, with varied statuses
7. `risk_signals`, `case_evidence`, `recommendations` — per case
8. `reviews` — for closed cases, with mix of actions and reason codes
9. `audit_logs` — generated from the above (do not fabricate — derive from seeded events)
