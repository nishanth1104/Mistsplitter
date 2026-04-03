<div align="center">
  <img src="./docs/images/logo.png" alt="Mistsplitter" width="420" />
  <p><strong>Governed AI orchestration platform for fintech operations</strong></p>
  <p>
    <img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js" />
    <img src="https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma" />
    <img src="https://img.shields.io/badge/MCP-Native-7C3AED?style=flat-square" alt="MCP" />
    <img src="https://img.shields.io/badge/pnpm-Monorepo-F69220?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm" />
    <img src="https://img.shields.io/badge/Vitest-216_tests-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest" />
  </p>
</div>

---

## What Is Mistsplitter

Mistsplitter is a **policy-governed, audit-centric AI orchestration platform** built for high-stakes fintech operations — fraud detection, AML, KYC, and suspicious activity review.

**This is not a chatbot.** AI agents gather evidence, compute risk signals, and propose structured recommendations. Humans retain approval authority. Every action is audited. Every agent is permissioned. Every tool call is logged.

The core workflow: a suspicious transaction triggers an alert → a case is created → specialized AI agents retrieve context, compute signals, assemble evidence, and generate a recommendation → a human reviewer approves, overrides, or escalates → the outcome and full audit trail are persisted.

---

## Platform Surfaces

| Surface | Port | Description |
|---|---|---|
| **REST API** | `:3000` | Cases, workflow, reviews, agents, metrics, audit logs |
| **MCP Server** | `:3001` | Typed, permissioned tool access for AI agents |
| **CLI** | — | Full operational terminal interface |
| **Web App** | `:3002` | Operations dashboard — queue, case detail, audit explorer |
| **Core** | — | Shared domain model, Prisma schema, types, utilities |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript 5.5 (strict mode, no `any`) |
| Runtime | Node.js 20+ |
| API | Fastify with Zod validation on all boundaries |
| Database | PostgreSQL via Prisma ORM |
| AI Protocol | Model Context Protocol (`@modelcontextprotocol/sdk`) |
| AI Model | Claude Haiku (summary/recommendation generation) |
| CLI | Commander.js with chalk and ora |
| Web | Next.js 14 (App Router, Server + Client Components) |
| Styling | Tailwind CSS |
| Validation | Zod v4 on all external inputs |
| Testing | Vitest — 216 tests across 21 suites |
| Monorepo | pnpm workspaces |

---

## Architecture

```
                      ┌─────────────────────────────────────────┐
                      │           Mistsplitter Platform          │
                      └─────────────────────────────────────────┘

  Alert Ingested
       │
       ▼
  ┌─────────┐    ┌──────────────────────────────────────────────┐
  │  Case   │───▶│              Workflow Runtime                 │
  │ Created │    │                                              │
  └─────────┘    │  IntakeAgent → RetrievalAgent → SignalAgent  │
                 │  → EvidenceAgent → SummaryAgent → PolicyAgent│
                 └──────────────────┬───────────────────────────┘
                                    │ Recommendation
                                    ▼
                 ┌──────────────────────────────────────────────┐
                 │           Human Review Gate                   │
                 │     approve / override / escalate             │
                 └──────────────────┬───────────────────────────┘
                                    │
                                    ▼
                 ┌──────────────────────────────────────────────┐
                 │          Audit Trail + Metrics                │
                 │   Every action logged. Append-only.           │
                 └──────────────────────────────────────────────┘

  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │   API   │  │   MCP   │  │   CLI   │  │   Web   │
  │REST/HTTP│  │ Typed   │  │Commander│  │Next.js  │
  │Fastify  │  │ Tools   │  │  chalk  │  │App Router│
  └─────────┘  └─────────┘  └─────────┘  └─────────┘
       │              │            │            │
       └──────────────┴────────────┴────────────┘
                              │
                    ┌─────────────────┐
                    │  PostgreSQL DB   │
                    │  (Prisma ORM)    │
                    └─────────────────┘
```

See [`docs/architecture.md`](./docs/architecture.md) for the full architecture reference.

---

## Agent Registry

Seven specialized agents, each with a narrow purpose and explicit tool allowlist:

| Agent | Purpose | Allowed Tools |
|---|---|---|
| **IntakeAgent** | Validate alert, normalize input, create case | `create_case`, `validate_alert` |
| **RetrievalAgent** | Fetch contextual records from DB | `get_customer_profile`, `get_account_context`, `get_merchant_context`, `get_recent_transactions`, `get_prior_alerts`, `get_prior_reviews` |
| **SignalAgent** | Compute rule hits and risk markers | `compute_rule_hits`, `compute_risk_signals` |
| **EvidenceAgent** | Assemble structured evidence bundle | `build_evidence_bundle` |
| **SummaryAgent** | Generate narrative summary + recommendation via Claude | `draft_case_summary` |
| **PolicyAgent** | Evaluate whether workflow may proceed | `check_policy` |
| **ReviewLoggerAgent** | Persist review outcome and update metrics | `submit_review_record`, `write_audit_event`, `update_metrics` |

---

## MCP Tool Categories

18 typed tools exposed via MCP server — all require actor identity, permission check, and produce an audit log entry:

| Category | Tools | Min Role |
|---|---|---|
| **Read** | `get_case`, `get_alert`, `get_customer_profile`, `get_account_context`, `get_merchant_context`, `get_recent_transactions`, `get_prior_alerts`, `get_prior_reviews`, `get_case_audit` | analyst |
| **Compute** | `compute_rule_hits`, `compute_risk_signals`, `build_evidence_bundle`, `draft_case_summary`, `check_policy` | workflow-agent |
| **Action** | `submit_review`, `request_escalation`, `suspend_agent`, `revoke_agent` | reviewer / admin |

See [`docs/mcp-tools.md`](./docs/mcp-tools.md) for full schemas and examples.

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- PostgreSQL 15+
- Anthropic API key (for `SummaryAgent`)

### Setup

```bash
git clone https://github.com/<your-username>/mistsplitter.git
cd mistsplitter

pnpm install

cp .env.example .env
# Edit .env — set DATABASE_URL and ANTHROPIC_API_KEY

pnpm db:migrate      # Run Prisma migrations
pnpm db:seed         # Seed synthetic fintech data (customers, accounts, merchants, agents)
```

### Run

```bash
# Terminal 1 — API server
pnpm serve:api              # → http://localhost:3000

# Terminal 2 — Web operations dashboard
pnpm --filter @mistsplitter/web dev   # → http://localhost:3002
```

### Automated demo

```bash
# Start API first, then:
pnpm demo            # Runs scripts/demo.ts — full workflow in ~30 seconds
```

---

## CLI Demo

The CLI provides full operational control from the terminal:

```bash
# 1. Ingest a suspicious transaction alert
pnpm cli -- case ingest ./fixtures/sample-alert.json
#   → Creates case_01...  (47,500 USD wire transfer)

# 2. Run the full AI workflow
pnpm cli -- case run case_01...
#   → IntakeAgent → RetrievalAgent → SignalAgent → EvidenceAgent
#   → SummaryAgent (Claude generates narrative) → PolicyAgent
#   → awaiting_review

# 3. Inspect results
pnpm cli -- case show case_01...
pnpm cli -- case recommendation case_01...
pnpm cli -- case evidence case_01...
pnpm cli -- case audit case_01...

# 4. Submit human review
pnpm cli -- review approve case_01...
pnpm cli -- review override case_01...    # prompts for reason code
pnpm cli -- review escalate case_01...

# 5. Agent management
pnpm cli -- agent list
pnpm cli -- agent show <agent_id>
pnpm cli -- agent suspend <agent_id>

# 6. Replay a workflow run
pnpm cli -- replay case_01...
```

---

## Workflow — risk\_review (9 steps)

1. **Alert intake** — validate payload, assign severity, normalise fields
2. **Case creation** — create case record, assign correlation ID
3. **Context retrieval** — customer profile, account history, merchant data, transaction history, prior alerts and reviews
4. **Signal computation** — 7 risk signals: `high_amount`, `pep_customer`, `rapid_succession`, `unusual_merchant_category`, `prior_alert_history`, `amount_deviation`, `cross_border`
5. **Evidence assembly** — structured evidence bundle with top signals and linked entity references
6. **Summary generation** — Claude Haiku produces a bounded narrative from structured evidence only (no raw DB access)
7. **Policy evaluation** — determines if recommendation may proceed, what requires human gate
8. **Human review** — approve / override (with reason code) / escalate
9. **Outcome persistence** — final action, reviewer identity, reason code, full audit trail, metrics update

---

## Security Model

- **No LLM-generated SQL** — ever. Prisma ORM only.
- **No LLM-generated shell commands** — LLM output is treated as untrusted until schema-validated.
- **Zod on all boundaries** — every API route validates inputs; unknown fields → 400.
- **Role-based access** — 6 roles, hierarchical. All tool calls require permission check + audit entry.
- **Append-only audit log** — records are never deleted or truncated.
- **Secret redaction** — logger strips `password`, `token`, `apiKey`, `secret`, `authorization` fields before writing.
- **Body size limit** — 1MB cap on all API requests.

See [`docs/security-model.md`](./docs/security-model.md) for the full threat model.

---

## Project Structure

```
mistsplitter/
├── packages/
│   ├── core/        # Domain types, Prisma schema, DB client, logger, errors
│   ├── api/         # REST API (Fastify) — cases, workflow, reviews, agents, metrics, audit
│   ├── workflow/    # Workflow runtime and state machine
│   ├── agents/      # 7 agent executors + registry + permission enforcement
│   ├── mcp/         # MCP server — 18 typed tools with permission checks
│   ├── cli/         # Terminal CLI — commander.js, chalk, ora
│   ├── policy/      # Policy engine — evaluates workflow gates
│   └── audit/       # Append-only audit event writer + replay engine
├── web/             # Next.js 14 App Router operations dashboard
├── docs/            # Architecture, data model, MCP tools, security model, workflow
├── scripts/
│   ├── seed.ts      # Seed synthetic fintech data
│   └── demo.ts      # Full workflow demo
├── fixtures/
│   └── sample-alert.json   # $47,500 wire transfer alert for demos
└── docker-compose.yml
```

---

## Testing

```bash
pnpm test          # 216 tests across 21 test suites
pnpm typecheck     # Strict TypeScript — zero errors across all packages
pnpm lint          # ESLint — zero warnings
```

Test coverage includes:
- Auth middleware — all 6 roles, hierarchy enforcement
- MCP permissions — all 18 tools × 6 roles
- Agent registry — scope enforcement, tool allowlists
- Policy engine — all decision outcomes
- Workflow state machine — all 23 state transitions
- API routes — validation, 401/403/404/400 cases, happy paths
- Audit logger — secret redaction, nested objects, arrays
- Core utilities — Result type, ID generation, config

---

## Documentation

| Doc | Description |
|---|---|
| [`docs/architecture.md`](./docs/architecture.md) | System architecture, component responsibilities, data flow |
| [`docs/data-model.md`](./docs/data-model.md) | Full Prisma schema reference and entity relationships |
| [`docs/mcp-tools.md`](./docs/mcp-tools.md) | All 18 MCP tools — schemas, permissions, examples |
| [`docs/security-model.md`](./docs/security-model.md) | Threat model, auth, audit integrity, approval controls |
| [`docs/workflow-walkthrough.md`](./docs/workflow-walkthrough.md) | End-to-end walkthrough of the risk\_review workflow |

---

## Phase Completion

- [x] Phase 1 — Platform foundation (schema, API skeleton, workflow runtime, audit, policy, agent registry)
- [x] Phase 2 — MCP server (typed tools, permissions, logging)
- [x] Phase 3 — CLI (all command groups, JSON output, replay, color UI)
- [x] Phase 4 — Workflow 1: risk\_review end-to-end (full agent pipeline, Claude integration)
- [x] Phase 5 — Web app (dashboard, case queue, case detail, audit explorer, agent registry)
- [x] Phase 6 — Security hardening (Zod on all boundaries, permission matrix tests, query safety)
- [x] Phase 7 — Demo layer (README, favicon, demo script, asset organization)

---

## Domain Glossary

| Term | Meaning |
|---|---|
| **AML** | Anti-Money Laundering — detecting suspicious financial activity |
| **KYC** | Know Your Customer — identity verification and risk profiling |
| **SAR** | Suspicious Activity Report — formal regulatory filing |
| **Risk tier** | Customer risk classification (low / medium / high / PEP) |
| **PEP** | Politically Exposed Person — elevated AML scrutiny |
| **Alert** | System-generated flag on a transaction requiring review |
| **Case** | The governed review unit created from an alert |
| **Override** | Reviewer disagrees with agent recommendation — requires reason code |
| **Escalation** | Case requires senior or specialist review |
| **Correlation ID** | Trace ID linking all events in a single workflow run |

---

## License

MIT
