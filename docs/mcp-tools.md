# Mistsplitter — MCP Tools Reference

MCP server lives in `packages/mcp/`. All tools have typed Zod schemas, actor checks, permission enforcement, and audit logging on every call.

---

## Tool Categories

| Category | Permission tier | Side effects | Who can call |
|---|---|---|---|
| `read` | Lowest | None | Any registered agent |
| `compute` | Medium | None (computation only) | Agents with compute scope |
| `action` | Highest | State changes, triggers human approval | Policy-cleared actors only |

---

## Read Tools

### `get_case`
Retrieve a case record by ID.

```typescript
input: {
  case_id: string  // ULID
}

output: {
  case_id: string
  alert_id: string
  status: CaseStatus
  priority: Priority
  assigned_to: string | null
  correlation_id: string
  created_at: string  // ISO 8601
}
```

---

### `get_alert`
Retrieve an alert record.

```typescript
input: {
  alert_id: string
}

output: {
  alert_id: string
  transaction_id: string
  alert_type: AlertType
  severity: Severity
  created_at: string
}
```

---

### `get_customer_profile`
Retrieve customer profile for a given case.

```typescript
input: {
  case_id: string
}

output: {
  customer_id: string
  customer_type: 'individual' | 'business'
  country: string          // ISO 3166-1 alpha-2
  risk_tier: RiskTier      // low | medium | high | pep
  account_count: number
  created_at: string
}
```

---

### `get_account_context`
Retrieve account details linked to the transaction in a case.

```typescript
input: {
  case_id: string
}

output: {
  account_id: string
  customer_id: string
  status: AccountStatus
  opened_at: string
  transaction_count_30d: number
  avg_transaction_amount_30d: number
  last_transaction_at: string | null
}
```

---

### `get_merchant_context`
Retrieve merchant details for the transaction in a case.

```typescript
input: {
  case_id: string
}

output: {
  merchant_id: string
  category: string       // MCC-style code
  country: string
  risk_tag: 'standard' | 'elevated' | 'restricted'
  prior_alert_count: number
}
```

---

### `get_recent_transactions`
Retrieve recent transaction history for the account in a case.

```typescript
input: {
  case_id: string
  limit?: number   // default 20, max 100
  days?: number    // lookback window, default 30
}

output: {
  transactions: Array<{
    transaction_id: string
    amount: number
    currency: string
    channel: Channel
    merchant_id: string
    merchant_category: string
    timestamp: string
    status: TransactionStatus
  }>
  total_count: number
  lookback_days: number
}
```

---

### `get_prior_alerts`
Retrieve prior alerts for the customer associated with a case.

```typescript
input: {
  case_id: string
  limit?: number   // default 10
}

output: {
  alerts: Array<{
    alert_id: string
    alert_type: AlertType
    severity: Severity
    transaction_id: string
    created_at: string
  }>
  total_count: number
}
```

---

### `get_prior_reviews`
Retrieve prior review outcomes for the customer.

```typescript
input: {
  case_id: string
  limit?: number   // default 10
}

output: {
  reviews: Array<{
    review_id: string
    case_id: string
    final_action: ReviewAction
    override_flag: boolean
    reason_code: string | null
    reviewed_at: string
  }>
  total_count: number
}
```

---

### `get_case_audit`
Retrieve the full audit trail for a case.

```typescript
input: {
  case_id: string
}

output: {
  events: Array<{
    log_id: string
    actor_type: ActorType
    actor_id: string
    action: string
    payload_json: Record<string, unknown>
    created_at: string
  }>
  total_count: number
}
```

---

## Compute Tools

### `compute_rule_hits`
Evaluate configured rule set against the transaction and account context.

```typescript
input: {
  case_id: string
}

output: {
  rule_hits: Array<{
    rule_id: string
    rule_name: string
    triggered: boolean
    threshold: string
    observed_value: string
    severity_contribution: 'low' | 'medium' | 'high'
  }>
  total_hits: number
}
```

**Example rule names:**
- `AMOUNT_THRESHOLD_10K`
- `VELOCITY_5_IN_24H`
- `RESTRICTED_MERCHANT_CATEGORY`
- `CROSS_BORDER_WIRE`
- `PRIOR_ALERT_WITHIN_90D`
- `NEW_MERCHANT_HIGH_AMOUNT`
- `PEP_CUSTOMER_ANY_AMOUNT`

---

### `compute_risk_signals`
Compute statistical and behavioral risk signals.

```typescript
input: {
  case_id: string
}

output: {
  signals: Array<{
    signal_name: string
    signal_value: string
    signal_reason: string
    weight: 'low' | 'medium' | 'high'
  }>
  composite_score: number   // 0–100
}
```

---

### `build_evidence_bundle`
Assemble the structured evidence packet from all retrieved and computed data.

```typescript
input: {
  case_id: string
}

output: {
  evidence_id: string
  case_id: string
  top_signals: Array<{
    signal_name: string
    signal_reason: string
    weight: string
  }>
  rule_hits: string[]
  linked_entities: {
    customer_id: string
    account_id: string
    merchant_id: string
  }
  recent_event_summary: string
  policy_references: string[]
  assembled_at: string
}
```

---

### `draft_case_summary`
Generate a bounded narrative summary and recommendation from the evidence bundle.

This is the **only tool that invokes an LLM**. The LLM receives only the structured evidence bundle — not raw DB content.

```typescript
input: {
  case_id: string
  evidence_id: string
}

output: {
  recommendation_id: string
  recommended_action: 'clear' | 'review_further' | 'escalate'
  summary: string           // LLM-generated narrative, max 500 chars
  confidence: 'low' | 'medium' | 'high'
  evidence_references: string[]   // which signals drove the recommendation
  generated_at: string
}
```

**LLM output validation:**
Output is parsed by Zod schema before storage. If the LLM returns malformed output or an invalid `recommended_action` value, the step is marked as failed and the workflow halts pending human intervention.

---

### `check_policy`
Evaluate whether the current workflow state is permitted to proceed.

```typescript
input: {
  case_id: string
  proposed_action: string   // e.g., 'submit_to_review', 'auto_close', 'escalate'
  agent_id: string
}

output: {
  policy_event_id: string
  decision: 'permitted' | 'blocked' | 'requires_approval'
  rationale: string
  applicable_rules: string[]
  evaluated_at: string
}
```

---

## Action Tools

Action tools change system state. They require:
- Actor must have `reviewer` role or above
- Policy engine must return `permitted`
- Every call generates an audit log entry regardless of outcome

---

### `submit_review`
Record a human reviewer's final action on a case.

```typescript
input: {
  case_id: string
  reviewer_id: string
  final_action: 'approved' | 'overridden' | 'escalated' | 'requested_context'
  override_flag: boolean
  reason_code?: string    // required if override_flag is true
  notes?: string
}

output: {
  review_id: string
  case_id: string
  final_action: ReviewAction
  reviewed_at: string
}
```

---

### `request_escalation`
Escalate a case to a senior reviewer or specialist team.

```typescript
input: {
  case_id: string
  requesting_reviewer_id: string
  escalation_reason: string
  target_team?: string    // e.g., 'aml_specialist', 'senior_review'
}

output: {
  case_id: string
  escalated_to: string
  escalated_at: string
}
```

---

### `suspend_agent`
Suspend a registered agent. Requires `admin` role.

```typescript
input: {
  agent_id: string
  reason: string
  suspended_by: string
}

output: {
  agent_id: string
  status: 'suspended'
  suspended_at: string
}
```

---

### `revoke_agent`
Permanently revoke a registered agent. Requires `admin` role. Cannot be undone.

```typescript
input: {
  agent_id: string
  reason: string
  revoked_by: string
}

output: {
  agent_id: string
  status: 'revoked'
  revoked_at: string
}
```

---

## Tool Implementation Pattern

Every tool in `packages/mcp/src/tools/` follows this pattern:

```typescript
import { z } from 'zod/v4'
import { auditLogger } from '@mistsplitter/audit'
import { checkPermission } from '../permissions'

const GetCaseInputSchema = z.object({
  case_id: z.string().ulid()
})

export const getCaseTool = {
  name: 'get_case',
  category: 'read' as const,
  description: 'Retrieve a case record by ID',
  inputSchema: GetCaseInputSchema,

  async execute(input: unknown, actor: Actor) {
    // 1. Validate input
    const parsed = GetCaseInputSchema.parse(input)

    // 2. Permission check
    checkPermission(actor, 'get_case')   // throws if not permitted

    // 3. Execute
    const result = await caseRepository.findById(parsed.case_id)

    // 4. Audit log
    await auditLogger.write({
      actor_type: actor.type,
      actor_id: actor.id,
      action: 'tool.called',
      case_id: parsed.case_id,
      payload_json: { tool: 'get_case', input: parsed }
    })

    return result
  }
}
```
