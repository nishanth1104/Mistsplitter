# Mistsplitter

Governed MCP-native AI orchestration platform for fintech operations.

Mistsplitter is **not a chatbot**. It is a policy-governed, audit-centric workflow platform where AI agents assist human reviewers in high-stakes fintech operations. Agents gather evidence, compute risk signals, generate structured reasoning artifacts, and propose actions — humans retain approval authority.

---

## What This Project Is

**Domain:** Fintech operations — fraud, AML, KYC, suspicious activity review.

**Core workflow (v1):** Suspicious Transaction / Risk Review
- An alert arrives → a case is created → agents gather context → signals are computed → evidence is assembled → a summary and recommendation are generated → a human reviewer approves, overrides, or escalates → outcome and audit trail are persisted.

**Platform surfaces:**
- `api/` — REST API service (workflow initiation, review submission, admin, metrics)
- `mcp/` — MCP server (typed, permissioned tool access for agents and external clients)
- `cli/` — Terminal CLI (ingest, inspect, review, replay, admin)
- `web/` — Web application (queue, case detail, audit explorer, dashboard)
- `core/` — Shared domain model, types, and utilities

**This is a portfolio project.** It must feel like a real fintech system — not a demo, not a toy. Domain terminology, data model, and operational flows should reflect genuine AML/fraud/KYC operational contexts.

---

## Repo Structure

```
mistsplitter/
├── CLAUDE.md
├── README.md
├── docker-compose.yml
├── .env.example
│
├── packages/
│   ├── core/           # Shared domain types, DB schema, utilities
│   ├── api/            # REST API service (Express or Fastify)
│   ├── workflow/       # Workflow runtime and agent orchestration
│   ├── mcp/            # MCP server and tool registry
│   ├── cli/            # Terminal CLI (commander or yargs)
│   ├── policy/         # Policy engine
│   ├── audit/          # Audit logging system
│   └── agents/         # Individual agent implementations
│
├── web/                # Web application (Next.js or React)
│
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── mcp-tools.md
│   ├── security-model.md
│   └── workflow-walkthrough.md
│
└── scripts/
    ├── seed.ts         # Seed synthetic data
    └── demo.ts         # Demo case walkthrough
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict mode, no `any`) |
| Runtime | Node.js (Bun preferred if available) |
| API framework | Fastify or Express |
| Database | PostgreSQL via Prisma ORM |
| MCP | `@modelcontextprotocol/sdk` |
| CLI | Commander.js |
| Web | Next.js (App Router) |
| Validation | Zod v4 for all schemas |
| Testing | Vitest |
| Package manager | pnpm (monorepo with workspaces) |

---

## Commands

```bash
# Install
pnpm install

# Dev (all services)
pnpm dev

# Database
pnpm db:migrate        # Run Prisma migrations
pnpm db:seed           # Seed synthetic fintech data
pnpm db:studio         # Prisma Studio

# Test
pnpm test              # All tests
pnpm test:watch        # Watch mode

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build

# CLI (local dev)
pnpm cli -- case ingest --alert ./fixtures/sample-alert.json
pnpm cli -- case show <case_id>
pnpm cli -- review approve <case_id>
pnpm cli -- replay <case_id>
```

---

## Coding Conventions

### TypeScript
- Strict mode: enabled. No `any` — use `unknown` with type guards.
- All async functions must handle errors explicitly — never swallow exceptions.
- Use `Result<T, E>` pattern for operations that can fail predictably.
- Zod v4 for every external payload: API inputs, MCP tool inputs, LLM outputs.
- Centralize domain types in `packages/core/types/`.

### Database
- Prisma ORM only. No raw SQL strings assembled from user input or LLM output — ever.
- Read and write DB roles should be separated where feasible.
- Every table has `created_at`. Audit-relevant tables have `updated_at`.
- Never delete audit or policy event records — soft-delete or append-only patterns only.

### Agents
- Each agent is narrow: it has one purpose and an explicit allowlist of tools it may call.
- Agents do not call tools outside their registered scope.
- Agent output is always validated by system logic before any downstream action.
- LLM output is treated as untrusted until validated.
- No agent executes raw SQL, shell commands, or arbitrary filesystem operations.

### Security (non-negotiable)
- No LLM-generated SQL — ever.
- No LLM-generated shell commands — ever.
- No secrets in prompts, logs, or error messages.
- Schema validation on every external-facing payload.
- Tool calls require actor identity + permission check + audit log entry.
- Action-category MCP tools (submit_review, suspend_agent, etc.) require explicit policy clearance.

### Naming
- Internal modules: `core`, `workflow`, `policy`, `audit`, `agents`, `mcp`, `cli`, `api`, `web`
- Workflow name: `risk_review`
- Case ID format: `case_<ulid>`
- Correlation ID: tied to every workflow run, tool call, and audit event

### Tests
- Tests live in `__tests__/` next to the file they test.
- Every agent and MCP tool must have unit tests.
- Seed fixtures live in `fixtures/` and are used for both tests and CLI demos.
- Run `pnpm test && pnpm typecheck` before committing.

### Git
- Branch names: `feat/<area>-short-description` (e.g., `feat/mcp-get-case-tool`)
- Commit messages: imperative mood, present tense ("Add policy engine skeleton")
- No `console.log` in committed code — use the structured logger.

---

## Domain Model (Core Tables)

These are the primary entities. Prisma schema lives in `packages/core/prisma/schema.prisma`.

```
customers           — customer_id, customer_type, country, risk_tier
accounts            — account_id, customer_id, status, opened_at
merchants           — merchant_id, category, country, risk_tag
transactions        — transaction_id, account_id, merchant_id, amount, currency, channel, timestamp, status
alerts              — alert_id, transaction_id, alert_type, severity
cases               — case_id, alert_id, status, priority, assigned_to, correlation_id
risk_signals        — signal_id, case_id, signal_name, signal_value, signal_reason
case_evidence       — evidence_id, case_id, evidence_type, payload_json
recommendations     — recommendation_id, case_id, recommended_action, summary, confidence
reviews             — review_id, case_id, reviewer_id, final_action, override_flag, reason_code, notes
agent_registry      — agent_id, name, owner, role, status, approved_tools, allowed_actions, risk_level
policy_events       — policy_event_id, case_id, agent_id, decision, rationale
audit_logs          — log_id, case_id, actor_type, actor_id, action, payload_json
workflow_runs       — run_id, case_id, workflow_name, state, started_at, ended_at, status
metrics_snapshots   — snapshot_id, metric_name, metric_value, recorded_at
```

---

## Agent Registry

These agents exist in `packages/agents/`. Each is narrow and permissioned.

| Agent | Purpose | Allowed Tools |
|---|---|---|
| IntakeAgent | Validate alert, normalize input, create case | `create_case`, `validate_alert` |
| RetrievalAgent | Fetch contextual records from DB | `get_customer_profile`, `get_account_context`, `get_merchant_context`, `get_recent_transactions`, `get_prior_alerts`, `get_prior_reviews` |
| SignalAgent | Compute rule hits and risk markers | `compute_rule_hits`, `compute_risk_signals` |
| EvidenceAgent | Assemble structured evidence bundle | `build_evidence_bundle` |
| SummaryAgent | Generate narrative summary and recommendation | `draft_case_summary` |
| PolicyAgent | Evaluate whether workflow may proceed | `check_policy` |
| ReviewLoggerAgent | Persist final review and update metrics | `submit_review_record`, `write_audit_event`, `update_metrics` |

---

## MCP Tool Categories

MCP server lives in `packages/mcp/`. All tools have typed Zod schemas, actor checks, and audit logging.

**Read tools** (lowest permission tier):
`get_case`, `get_alert`, `get_customer_profile`, `get_account_context`, `get_merchant_context`, `get_recent_transactions`, `get_prior_alerts`, `get_prior_reviews`, `get_case_audit`

**Compute tools** (requires agent scope):
`compute_rule_hits`, `compute_risk_signals`, `build_evidence_bundle`, `draft_case_summary`, `check_policy`

**Action tools** (requires policy clearance + human approval path):
`submit_review`, `request_escalation`, `suspend_agent`, `revoke_agent`

---

## Workflow Steps (Workflow 1: risk_review)

1. **Alert intake** — validate payload, assign severity
2. **Case creation** — create case record, assign correlation ID
3. **Context retrieval** — customer, account, merchant, transaction history, prior alerts/reviews
4. **Signal computation** — rule hits, amount deviation, frequency, behavior patterns
5. **Evidence assembly** — structured evidence bundle with top signals, linked entities, policy refs
6. **Summary generation** — LLM generates bounded narrative from structured evidence only
7. **Policy evaluation** — determines if recommendation may proceed and what requires human gate
8. **Human review** — approve / override / escalate / request more context / annotate
9. **Outcome persistence** — final action, reviewer identity, reason code, audit trail, metrics update

---

## CLI Command Groups

```
case
  ingest <alert-file>           Ingest an alert and create a case
  run <case_id>                 Execute workflow for a case
  show <case_id>                Display case detail
  evidence <case_id>            Show evidence bundle
  recommendation <case_id>      Show recommendation and summary
  audit <case_id>               Show audit trail

review
  approve <case_id>             Approve the recommendation
  override <case_id>            Override with reason code
  escalate <case_id>            Escalate the case
  note <case_id> <text>         Add annotation

agent
  list                          List registered agents
  show <agent_id>               Show agent detail
  suspend <agent_id>            Suspend an agent
  revoke <agent_id>             Revoke an agent

policy
  check <case_id>               Evaluate policy for a case
  simulate <scenario>           Dry-run a policy scenario
  explain <policy_event_id>     Explain a policy decision

replay
  <case_id>                     Replay a workflow by case ID
  compare <run_id_a> <run_id_b> Compare two runs

serve
  api                           Start API server
  mcp                           Start MCP server
  all                           Start full local environment

seed
  data                          Seed synthetic fintech data
  alerts                        Seed demo alert set
  history                       Seed reviewer history
```

---

## Key Files to Know

| File | Purpose |
|---|---|
| `packages/core/types/index.ts` | Canonical domain types |
| `packages/core/prisma/schema.prisma` | Full DB schema |
| `packages/mcp/tools/index.ts` | MCP tool registry |
| `packages/policy/engine.ts` | Policy evaluation logic |
| `packages/audit/logger.ts` | Append-only audit event writer |
| `packages/workflow/runtime.ts` | Workflow state machine |
| `packages/agents/registry.ts` | Agent registry and scope enforcement |
| `cli/src/index.ts` | CLI entrypoint |
| `docs/architecture.md` | Full architecture reference |
| `docs/security-model.md` | Security model and threat mitigations |
| `fixtures/sample-alert.json` | Sample alert payload for dev/demo |

---

## What Claude Should Never Do In This Codebase

- Generate or execute raw SQL strings from any external input
- Generate or execute shell commands from LLM output
- Store secrets, tokens, or API keys in code, logs, or prompts
- Bypass the policy engine for action-tier MCP tools
- Allow an agent to call tools outside its registered allowlist
- Swallow exceptions silently
- Use `any` in TypeScript
- Write to audit_logs or policy_events with anything other than the official audit logger
- Remove or truncate audit records

---

## Fintech Domain Glossary

| Term | Meaning in this system |
|---|---|
| AML | Anti-Money Laundering — detecting suspicious financial activity |
| KYC | Know Your Customer — identity verification and risk profiling |
| SAR | Suspicious Activity Report — formal report filed with regulators |
| Risk tier | Customer risk classification (e.g., low / medium / high / PEP) |
| PEP | Politically Exposed Person — higher AML scrutiny category |
| Alert | System-generated flag on a transaction requiring review |
| Case | The governed review unit created from an alert |
| Override | Reviewer disagrees with agent recommendation — must capture reason code |
| Escalation | Case requires senior or specialist review |
| Evidence bundle | Structured collection of facts and signals supporting a recommendation |
| Rule hit | A specific risk rule triggered by transaction attributes |
| Signal | A computed risk indicator (e.g., amount deviation, unusual merchant category) |
| Correlation ID | Trace ID linking all events in a single workflow run |

---

## Phase Checklist

- [ ] Phase 1: Platform foundation (schema, API skeleton, workflow runtime, audit, policy, agent registry)
- [ ] Phase 2: MCP server (typed tools, permissions, logging)
- [ ] Phase 3: CLI (all command groups, JSON + human output, replay)
- [ ] Phase 4: Workflow 1 (full risk_review end-to-end)
- [ ] Phase 5: Web app (queue, case detail, audit explorer, dashboard)
- [ ] Phase 6: Security hardening (validation coverage, permission tests, query safety)
- [ ] Phase 7: Demo layer (README, architecture diagram, CLI demo, screenshots)
