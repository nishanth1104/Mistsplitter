# Mistsplitter — Architecture

---

## Overview

Mistsplitter is a monorepo with two distinct layers:

- **Platform layer** — reusable infrastructure: MCP server, workflow runtime, policy engine, audit system, agent registry, CLI, API, security controls
- **Workflow layer** — domain-specific logic built on top of the platform: `risk_review` (v1), with KYC, payments, and financial crime as future modules

The system is designed so that adding a new workflow requires writing domain logic (agents, tools, prompts, signals) without touching the platform core.

---

## Monorepo Structure

```
mistsplitter/
├── packages/
│   ├── core/               # Canonical domain types, Prisma schema, shared utilities
│   ├── api/                # Fastify REST API service
│   ├── workflow/           # Workflow runtime and state machine
│   ├── mcp/                # MCP server and tool registry
│   ├── cli/                # Commander.js terminal CLI
│   ├── policy/             # Policy engine
│   ├── audit/              # Append-only audit logger
│   └── agents/             # Individual agent implementations
│
├── web/                    # Next.js web application
│
├── docs/                   # Architecture, security, data model, walkthrough docs
├── fixtures/               # Sample alert payloads and seed data
└── scripts/                # Seed, demo, and utility scripts
```

---

## Component Responsibilities

### packages/core
- Canonical TypeScript domain types (shared across all packages)
- Prisma schema and generated client
- Shared utilities: ID generation (ULID), date helpers, result types
- Error types and structured error patterns
- Environment config loader

**Key files:**
- `src/types/index.ts` — all domain types exported from one place
- `prisma/schema.prisma` — full DB schema
- `src/config.ts` — env-based config with validation

### packages/api
- Fastify REST API
- Route handlers for: cases, alerts, reviews, agents, policy, audit, metrics
- Request validation via Zod schemas
- Auth middleware (role-based)
- Error handling middleware

**Key files:**
- `src/index.ts` — server bootstrap
- `src/routes/` — one file per route group
- `src/middleware/` — auth, validation, error handling

### packages/workflow
- Workflow state machine (defines valid state transitions)
- Workflow runner (executes agents in sequence, enforces policy checkpoints)
- Step registry (maps step names to agent handlers)
- Retry logic (idempotent, logged)
- Correlation ID propagation

**State transitions for `risk_review`:**
```
pending → intake → retrieving → computing_signals → assembling_evidence
        → generating_summary → awaiting_policy → awaiting_review
        → closed
```

**Key files:**
- `src/runtime.ts` — main orchestrator
- `src/states/risk-review.ts` — state machine definition
- `src/runner.ts` — step executor with retry and audit hooks

### packages/mcp
- MCP server implementation using `@modelcontextprotocol/sdk`
- Tool registry with typed Zod schemas per tool
- Permission enforcement: actor type + role + tool category
- Full call logging to audit system
- Tool versioning

**Tool categories:**
- `read` — lowest permission, no side effects
- `compute` — requires agent scope, no external side effects
- `action` — requires policy clearance, triggers human approval path

**Key files:**
- `src/server.ts` — MCP server bootstrap
- `src/tools/` — one file per tool or tool group
- `src/registry.ts` — tool registration and permission map

### packages/cli
- Commander.js CLI with command groups: `case`, `review`, `agent`, `policy`, `replay`, `serve`, `seed`
- Output modes: human-readable tables and structured JSON (`--json` flag)
- Confirmation prompts for sensitive actions (override, suspend, revoke)
- Local dev mode: connects to locally running API and MCP

**Key files:**
- `src/index.ts` — CLI entrypoint, command registration
- `src/commands/` — one file per command group
- `src/output/` — table formatter and JSON formatter

### packages/policy
- Policy engine: evaluates whether an agent/action is permitted given current case context
- Rule definitions: configurable per workflow
- Simulation mode: dry-run a policy check without side effects
- Policy event recording: every decision is stored

**Key files:**
- `src/engine.ts` — core evaluation logic
- `src/rules/` — rule definitions per workflow
- `src/types.ts` — PolicyDecision, PolicyRule types

### packages/audit
- Append-only audit event writer
- Every event has: log_id, case_id, actor_type, actor_id, action, payload_json, created_at
- No update or delete operations — ever
- Replay support: fetch ordered event stream by case_id

**Key files:**
- `src/logger.ts` — the only approved way to write audit events
- `src/replay.ts` — fetch and reconstruct event stream

### packages/agents
- One file per agent
- Each agent: narrow purpose, typed tool calls, explicit error handling
- Agents call tools through MCP client — they do not call DB directly
- Agent output always validated by caller before use

**Agents:**
- `intake.agent.ts`
- `retrieval.agent.ts`
- `signal.agent.ts`
- `evidence.agent.ts`
- `summary.agent.ts`
- `policy.agent.ts`
- `review-logger.agent.ts`

### web/
- Next.js App Router
- Pages: Queue, Case Detail, Audit Explorer, Agent Registry, Dashboard
- Fetches from API service
- No direct DB access from web layer

---

## Data Flow

```
Alert Input (CLI or API)
        │
        ▼
  Workflow Runtime
        │
        ├──▶ IntakeAgent ──▶ [create_case, validate_alert]
        │
        ├──▶ RetrievalAgent ──▶ [get_customer_profile, get_account_context,
        │                         get_merchant_context, get_recent_transactions,
        │                         get_prior_alerts, get_prior_reviews]
        │
        ├──▶ SignalAgent ──▶ [compute_rule_hits, compute_risk_signals]
        │
        ├──▶ EvidenceAgent ──▶ [build_evidence_bundle]
        │
        ├──▶ SummaryAgent ──▶ [draft_case_summary]  ← LLM call here only
        │
        ├──▶ PolicyAgent ──▶ [check_policy]
        │
        ├──▶ Human Review (web UI or CLI)
        │
        └──▶ ReviewLoggerAgent ──▶ [submit_review_record, write_audit_event, update_metrics]
```

LLM is called **only in SummaryAgent**. All other agents use deterministic logic against structured data.

---

## Security Boundaries

```
External Input
      │
      ▼
  Zod Validation ──── reject on schema failure
      │
      ▼
  Auth Middleware ─── reject on missing/invalid actor
      │
      ▼
  Policy Engine ──── reject if action not permitted
      │
      ▼
  Tool Handler ───── parameterized DB access only
      │
      ▼
  Audit Logger ───── append event (cannot be skipped)
      │
      ▼
  Response
```

LLM output re-enters the system as **untrusted input** and passes through Zod validation before any downstream use.

---

## Database

PostgreSQL via Prisma ORM.

- All queries go through Prisma — no raw SQL strings assembled from external input
- Read-heavy paths use indexed queries on case_id, correlation_id, actor_id
- audit_logs and policy_events are append-only (no update/delete in application code)
- Soft-delete pattern for agents (status field: active / suspended / revoked)

See `docs/data-model.md` for full schema.

---

## Environment Profiles

| Profile | Purpose |
|---|---|
| `local` | Developer machine, SQLite or local Postgres, no real secrets |
| `dev` | Shared dev environment, real Postgres, synthetic data |
| `demo` | Portfolio demo, seeded with realistic synthetic cases |
| `prod` | Future production (out of scope for MVP) |

---

## Key Design Decisions

**Why MCP?**
MCP gives the system a typed, inspectable, permission-enforced interface between agents and capabilities. It makes the tool layer auditable and replaceable without rewriting agent logic.

**Why narrow agents?**
A narrow agent with an explicit tool allowlist is auditable, testable, and cannot take unexpected actions. Broad agents are unpredictable and hard to govern.

**Why LLM only in SummaryAgent?**
Containing LLM calls to one agent means the blast radius of any hallucination or prompt issue is limited. All other decisions (signals, policy, routing) are deterministic.

**Why Prisma and no raw SQL?**
Parameterized queries are enforced by default. The risk of SQL injection from user input or LLM output is eliminated at the architecture level, not just by convention.

**Why append-only audit?**
Audit integrity is a core product promise. If audit records can be modified, the system's auditability claims collapse. Append-only is enforced in application code and can be further enforced at DB level with row-level security.
