# Mistsplitter — Workflow Walkthrough

## Workflow 1: Suspicious Transaction / Risk Review (`risk_review`)

This document walks through the complete lifecycle of a case from alert ingestion to final review outcome.

---

## The Scenario

A customer makes a $47,500 wire transfer to a foreign account. The transaction triggers an amount threshold rule and a cross-border wire rule. An alert is generated. The `risk_review` workflow begins.

---

## Step 1: Alert Intake

**Actor:** System / CLI / API  
**Agent:** IntakeAgent  
**Tools:** `validate_alert`, `create_case`

The alert payload arrives. It contains:
```json
{
  "transaction_id": "txn_01JXABC...",
  "alert_type": "amount_threshold",
  "severity": "high"
}
```

IntakeAgent validates the schema. If valid:
- A case is created with status `pending`
- A `correlation_id` (ULID) is assigned — this will tie every downstream event together
- Priority is set based on severity: `high` severity → `high` priority
- Audit event written: `alert.received`, `case.created`

**CLI equivalent:**
```bash
mistsplitter case ingest --alert ./fixtures/sample-alert.json
# Output: Case created: case_01JXDEF... [priority: high]
```

---

## Step 2: Context Retrieval

**Agent:** RetrievalAgent  
**Tools:** `get_customer_profile`, `get_account_context`, `get_merchant_context`, `get_recent_transactions`, `get_prior_alerts`, `get_prior_reviews`

RetrievalAgent fetches all relevant context in parallel where possible:

| Tool call | What it returns |
|---|---|
| `get_customer_profile` | Customer is `individual`, `risk_tier: medium`, country: `US` |
| `get_account_context` | Account active, opened 3 years ago, avg monthly spend $4,200 |
| `get_merchant_context` | Foreign wire recipient, `risk_tag: elevated` |
| `get_recent_transactions` | 12 transactions in last 30 days, mostly domestic card, $200–$800 range |
| `get_prior_alerts` | 1 prior alert 8 months ago, type `velocity`, severity `low` |
| `get_prior_reviews` | Prior case was closed as `clear` |

All results stored as `case_evidence` records. Audit event: `agent.invoked` for each tool call.

---

## Step 3: Signal Computation

**Agent:** SignalAgent  
**Tools:** `compute_rule_hits`, `compute_risk_signals`

SignalAgent evaluates the retrieved context against configured rules and computes statistical signals.

**Rule hits:**
| Rule | Triggered | Observed | Threshold |
|---|---|---|---|
| `AMOUNT_THRESHOLD_10K` | ✅ | $47,500 | $10,000 |
| `CROSS_BORDER_WIRE` | ✅ | Foreign recipient | Any |
| `VELOCITY_5_IN_24H` | ❌ | 1 transaction | 5 |
| `PRIOR_ALERT_WITHIN_90D` | ❌ | 8 months ago | 90 days |

**Computed signals:**
| Signal | Value | Reason |
|---|---|---|
| `amount_deviation_3sigma` | 11.3x mean | $47,500 vs account mean of $4,200 |
| `new_merchant_high_amount` | true | First transaction with this recipient |
| `elevated_merchant_risk` | true | Merchant `risk_tag: elevated` |

Composite risk score: **78 / 100**

Risk signals stored in `risk_signals` table. Audit event: `agent.invoked`.

---

## Step 4: Evidence Assembly

**Agent:** EvidenceAgent  
**Tool:** `build_evidence_bundle`

EvidenceAgent assembles the structured evidence bundle from all retrieved and computed data.

```json
{
  "evidence_id": "evi_01JXGHI...",
  "case_id": "case_01JXDEF...",
  "top_signals": [
    { "signal_name": "amount_deviation_3sigma", "signal_reason": "$47,500 is 11.3x the 30-day account mean of $4,200", "weight": "high" },
    { "signal_name": "cross_border_wire", "signal_reason": "Wire transfer to foreign account", "weight": "high" },
    { "signal_name": "elevated_merchant_risk", "signal_reason": "Recipient merchant tagged as elevated risk", "weight": "medium" }
  ],
  "rule_hits": ["AMOUNT_THRESHOLD_10K", "CROSS_BORDER_WIRE"],
  "linked_entities": {
    "customer_id": "cus_01JX...",
    "account_id": "acc_01JX...",
    "merchant_id": "mer_01JX..."
  },
  "recent_event_summary": "12 transactions in 30 days, avg $510, all domestic card. This is the first wire transfer.",
  "policy_references": ["RULE_WIRE_THRESHOLD", "RULE_CROSS_BORDER"]
}
```

Audit event: `evidence.assembled`.

---

## Step 5: Summary Generation

**Agent:** SummaryAgent  
**Tool:** `draft_case_summary`

SummaryAgent passes the structured evidence bundle to the LLM with a constrained prompt. The LLM sees only the evidence bundle — not raw DB content.

**LLM generates:**
```
Summary: A $47,500 wire transfer was made to a foreign elevated-risk recipient — 
11x above this account's normal activity. Two rules triggered: amount threshold 
and cross-border wire. The customer has a clean recent history with one low-severity 
alert 8 months ago. The combination of amount deviation, channel mismatch 
(first wire on an otherwise card-only account), and elevated merchant risk warrants 
further review before any action.

Recommended action: review_further
Confidence: high
```

LLM output is validated by Zod:
- `recommended_action` must be one of `clear | review_further | escalate`
- `summary` must be under 500 characters
- `confidence` must be one of `low | medium | high`

If validation fails → workflow halts, human notified. If valid → stored as `recommendation` record.

Audit event: `summary.generated`.

---

## Step 6: Policy Evaluation

**Agent:** PolicyAgent  
**Tool:** `check_policy`

PolicyAgent evaluates whether the recommendation may proceed to human review.

```json
{
  "decision": "permitted",
  "rationale": "Case priority high, recommendation is review_further, no auto-close policy applies. Proceeding to human review queue.",
  "applicable_rules": ["REQUIRE_HUMAN_REVIEW_HIGH_PRIORITY", "NO_AUTO_CLOSE_CROSS_BORDER_WIRE"]
}
```

Case status updated: `pending` → `in_review`. Case appears in reviewer queue.

Audit event: `policy.evaluated`.

---

## Step 7: Human Review

**Actor:** Reviewer (web UI or CLI)  
**Tool:** `submit_review` (action tier — requires reviewer role)

The reviewer opens the case. They see:

- Transaction: $47,500 wire, foreign recipient
- Customer: medium risk, 3-year account
- Top signals: amount deviation 11x, first wire, elevated merchant
- Summary: "warrants further review"
- Recommendation: `review_further`
- Prior history: 1 prior alert 8 months ago (cleared)

The reviewer decides to **override** — they recognize this is a known business partner and the customer had previously flagged this type of transfer in their account notes.

```bash
mistsplitter review override case_01JXDEF... \
  --reason-code KNOWN_CUSTOMER_PATTERN \
  --notes "Customer flagged this transfer in account notes. Verified via support ticket #4821."
```

Review record created:
```json
{
  "final_action": "overridden",
  "override_flag": true,
  "reason_code": "KNOWN_CUSTOMER_PATTERN",
  "notes": "Customer flagged this transfer in account notes. Verified via support ticket #4821.",
  "reviewer_id": "usr_01JX..."
}
```

---

## Step 8: Outcome Persistence

**Agent:** ReviewLoggerAgent  
**Tools:** `submit_review_record`, `write_audit_event`, `update_metrics`

ReviewLoggerAgent persists the final outcome:

- Case status updated: `in_review` → `closed_clear`
- Review record written to `reviews` table
- Audit events written:
  - `review.submitted`
  - `review.overridden`
  - `case.closed`
- Metrics updated:
  - `override_rate` incremented
  - `avg_review_time_seconds` updated
  - `queue_backlog` decremented

---

## Complete Audit Trail

```
alert.received          system       alert_01JX...
case.created            system       case_01JX...
agent.invoked           IntakeAgent  validate_alert
agent.invoked           IntakeAgent  create_case
agent.invoked           RetrievalAgent  get_customer_profile
agent.invoked           RetrievalAgent  get_account_context
agent.invoked           RetrievalAgent  get_merchant_context
agent.invoked           RetrievalAgent  get_recent_transactions
agent.invoked           RetrievalAgent  get_prior_alerts
agent.invoked           RetrievalAgent  get_prior_reviews
agent.invoked           SignalAgent   compute_rule_hits
agent.invoked           SignalAgent   compute_risk_signals
evidence.assembled      EvidenceAgent  evi_01JX...
summary.generated       SummaryAgent   rec_01JX...
policy.evaluated        PolicyAgent    permitted
review.submitted        usr_01JX...    overridden
review.overridden       usr_01JX...    KNOWN_CUSTOMER_PATTERN
case.closed             system         closed_clear
```

Replay this audit trail at any time:
```bash
mistsplitter replay case_01JXDEF...
```

---

## Reviewer Experience (Web UI)

The case detail page shows:

1. **Header** — Case ID, severity badge, priority badge, status, age
2. **Transaction panel** — amount, currency, channel, merchant, timestamp
3. **Customer & account panel** — risk tier, account age, recent activity summary
4. **Risk signals panel** — top signals ranked by weight, rule hits list
5. **Evidence panel** — assembled evidence bundle, linked entities
6. **Summary panel** — LLM-generated narrative, recommended action, confidence
7. **Review controls** — Approve / Override / Escalate / Request Context buttons
8. **Audit timeline** — collapsible step-by-step history

---

## CLI Demo Flow

Full end-to-end demo from terminal:

```bash
# Seed demo data
mistsplitter seed alerts

# Ingest an alert
mistsplitter case ingest --alert ./fixtures/sample-alert.json

# Run the workflow
mistsplitter case run case_01JXDEF...

# Inspect the result
mistsplitter case show case_01JXDEF...
mistsplitter case evidence case_01JXDEF...
mistsplitter case recommendation case_01JXDEF...

# Review
mistsplitter review override case_01JXDEF... \
  --reason-code KNOWN_CUSTOMER_PATTERN \
  --notes "Verified via support ticket"

# Inspect audit trail
mistsplitter case audit case_01JXDEF...

# Replay the workflow
mistsplitter replay case_01JXDEF...
```
