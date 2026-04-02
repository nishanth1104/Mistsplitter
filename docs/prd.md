# Mistsplitter — Product Requirements Document

**Version:** v1.0  
**Status:** Build-ready  
**Primary objective:** Build a secure, auditable, extensible platform for AI-assisted fintech workflows, starting with suspicious-transaction and risk review.

---

## 1. Executive Summary

Mistsplitter is a governed AI workflow platform designed for high-stakes fintech operations.

It combines:
- an MCP server for structured, permissioned tool access
- a terminal CLI for developer and operator workflows
- a web application for review, oversight, and analytics
- a policy engine for approvals, permissions, and workflow controls
- a workflow runtime for orchestrating specialized agents
- a security-first architecture for sensitive operational use cases
- a shared domain model that supports multiple fintech workflows over time

Mistsplitter is **not a chatbot** and **not an autonomous finance agent**.

It is a governed operational system where AI agents assist humans by gathering evidence, generating structured reasoning artifacts, proposing next steps, and operating within tightly controlled security and policy boundaries.

**The first workflow is: Suspicious Transaction / Risk Review**

This workflow proves the value of the platform by solving a concrete, high-stakes problem: how to gather fragmented operational context, evaluate risk indicators, generate explainable case summaries, enforce review policy, and keep humans in control.

---

## 2. Product Vision

Build the reference platform for safe, auditable AI workflows in fintech.

Mistsplitter should become a system that teams can use to:
- orchestrate AI agents safely
- expose workflows through MCP
- operate and debug workflows through CLI
- review and approve outcomes in a web UI
- preserve full auditability
- extend the same platform into payments, customer servicing, KYC, financial crime, disputes, and exception operations

**Long-term vision:** One secure platform. Multiple regulated workflows. Evidence before action.

---

## 3. Product Thesis

Fintech operations do not need unconstrained autonomous agents.

They need systems that can:
- retrieve structured evidence from multiple sources
- reduce repetitive analyst work
- make decisions more consistent
- preserve human oversight
- log every meaningful action
- enforce policy and permissions at runtime
- remain secure against common classes of attack

Mistsplitter exists to make AI useful in regulated operational environments without sacrificing traceability, reviewability, or control.

---

## 4. Core Principles

### 4.1 Evidence before action
No agent recommendation or action should exist without a structured evidence basis.

### 4.2 Human control over sensitive decisions
Agents may assist, summarize, recommend, and prepare. Humans remain the approval authority for sensitive outcomes.

### 4.3 Least privilege by default
Every agent, tool, API, and command operates with minimal required access.

### 4.4 Structured over free-form
Structured data, typed tool inputs, validated outputs, and schema-bound workflows take priority over unconstrained natural-language behavior.

### 4.5 Audit by design
Every workflow step, tool invocation, decision proposal, approval, override, and policy check must be logged.

### 4.6 Security is product scope
Security is not a non-functional afterthought. It is a core feature of the system.

### 4.7 Platform first, workflow first
Mistsplitter is one platform, but it proves itself through real workflows. Build one workflow deeply before expanding.

---

## 5. Problem Statement

Operational fintech teams often face the same friction pattern:
- signals arrive from multiple systems
- evidence is fragmented
- reviewers spend time gathering context
- decisions become inconsistent
- false positives consume analyst bandwidth
- documentation is uneven
- audit reconstruction is painful
- unsafe automation creates trust issues

Existing operational processes are frequently tool-fragmented and human-heavy. AI can help, but only when integrated into a controlled runtime that preserves evidence, permissions, and human review.

Mistsplitter addresses this by acting as a governed workflow control plane for sensitive fintech operations.

---

## 6. Product Scope

### 6.1 In scope
- workflow orchestration runtime
- MCP server
- terminal CLI
- web UI
- PostgreSQL-backed data model
- agent registry
- policy engine
- audit logging system
- secure tool runtime
- workflow-specific modules
- analytics and replay features
- synthetic-data support for development and portfolio use

### 6.2 Out of scope for MVP
- live banking or card-processor integrations
- production identity-provider integrations
- sanctions vendor integrations
- automated filing to regulators
- automatic money movement
- graph database and link analysis
- real customer data
- full enterprise multi-tenancy
- fully autonomous operational closure with no human oversight

---

## 7. Product Structure

### 7.1 Platform layer (reusable across all workflows)
- MCP server
- CLI
- API service
- agent registry
- policy engine
- audit system
- workflow runtime
- data access layer
- security controls
- admin and analytics foundation

### 7.2 Workflow layer (domain-specific modules built on the platform)
- suspicious transaction / risk review ← **build this first**
- KYC / onboarding review
- customer support escalation
- payment exception handling
- financial-crime alert triage
- dispute evidence review

---

## 8. Users

### 8.1 Primary — Analysts / Reviewers
People who inspect cases, review evidence, accept or override recommendations, and escalate when needed.

### 8.2 Secondary — Team Leads / Operations Managers
People who monitor flow, review overrides, inspect agent behavior, tune policies, and enforce operational standards.

### 8.3 Tertiary — Platform / ML / Product Engineers
People who add tools, improve prompts, tune thresholds, author new workflows, and operate the platform.

### 8.4 Future — Customer Support and Payments Operations Teams
Users who benefit from the same infrastructure for operational decision support.

---

## 9. First Workflow: Suspicious Transaction / Risk Review

### 9.1 Objective
Reduce the time and inconsistency involved in reviewing suspicious financial activity by assembling relevant context, computing risk markers, generating explainable summaries, and routing the case through policy-governed human review.

### 9.2 Inputs
- alert payload
- transaction record
- account record
- customer record
- merchant record
- prior alerts
- prior reviews
- configured policy rules

### 9.3 Outputs
- case record
- evidence bundle
- risk signals
- summary narrative
- recommended next action
- policy decision
- final reviewer action
- audit trail

### 9.4 Reviewer Actions
- approve recommendation
- override recommendation
- request more context
- escalate
- annotate
- assign reason code

### 9.5 Possible Recommendation States
- `clear`
- `review_further`
- `escalate`

---

## 10. Future Workflows

These are not separate products. They are modules on the same platform.

### Workflow 2: KYC / Onboarding Review
Help reviewers inspect identity and onboarding-related evidence, incomplete profiles, and risk indicators.

### Workflow 3: Customer Support Escalation
Summarize support context, risk flags, customer history, and recommended routing or handling.

### Workflow 4: Payment Exception Handling
Assist in investigating anomalies, failed payments, settlement mismatches, or operational exceptions.

### Workflow 5: Financial-Crime Alert Triage
Prioritize and prepare investigation-ready case packets for analyst review.

### Workflow 6: Dispute Evidence Review
Collect and structure evidence for chargeback or dispute handling.

All future workflows share: agent runtime, policy engine, audit system, MCP tool access, CLI conventions, web UI patterns, security model, data governance model.

---

## 11. Product Goals

### 11.1 Primary
- build a production-quality architecture for governed AI operations
- prove value through a high-impact workflow
- reduce manual evidence-gathering effort
- increase consistency of case handling
- make every AI-assisted step auditable
- create a developer-usable MCP and CLI experience
- establish strong security boundaries

### 11.2 Secondary
- make workflows modular and extensible
- provide a polished portfolio-grade system
- support local development, demo, and replay
- create reusable patterns for future fintech workflows

### 11.3 Non-goals
- replace human investigators
- claim regulatory equivalence
- automate live financial actions
- maximize agent autonomy at the expense of control
- support every workflow in v1

---

## 12. Functional Requirements

### 12.1 Platform

**Workflow Runtime**
- create workflow instances
- manage step sequencing
- enforce policy checkpoints
- handle retries safely
- correlate all workflow events to a case ID
- support deterministic replay

**Agent Registry**
- register agents with ownership, scopes, allowed tools
- record status: active, suspended, revoked
- record risk level
- allow agent inspection in UI and CLI

**Policy Engine**
- evaluate which tools/actions an agent may use
- determine when human approval is required
- stop workflows on policy failure
- record each policy decision
- support simulation and dry-run checks

**Audit System**
- log all workflow events, tool calls, policy decisions, summaries, recommendations, reviewer actions
- support replay by case ID

**MCP Server**
- expose typed tools with schema validation
- enforce permissions
- log all calls
- reject unknown or unsafe calls
- maintain stable tool contracts

**CLI**
- support ingestion, run, inspect, review, policy simulation, replay, and admin operations
- return human-readable and JSON outputs
- support local development mode
- support safe confirmation flows for sensitive actions

**Web UI**
- queue view, case detail view, review controls
- audit exploration, agent administration, policy visibility, metrics dashboard

### 12.2 Workflow 1 Specifics

**Alert Intake:** accept alert through API or CLI, validate, create case, assign severity/priority, create correlation ID

**Context Retrieval:** customer profile, account context, merchant context, recent transaction history, prior alerts, prior review outcomes

**Signal Generation:** rule hits, amount deviation, transaction-frequency features, behavior-pattern signals, recurrence markers

**Evidence Bundle:** top risk indicators, relevant recent events, linked entities, policy references, evidence trace

**Summary Generation:** analyst-facing summary, key flagging reasons, supporting evidence references, recommended action, confidence/uncertainty note

**Human Review:** approve / override / escalate / request more context / add notes / assign reason codes

**Outcome Persistence:** final action, reviewer identity, notes, override flag, timestamps, updated metrics

---

## 13. Non-Functional Requirements

### 13.1 Reliability
- workflow failures must be logged
- retries must not create silent duplicate outcomes
- APIs must return consistent error structures
- replay must reconstruct prior execution paths

### 13.2 Performance
- case retrieval and assembly should feel responsive in demo and local use
- CLI commands should return quickly for common operations
- web UI should load queue and case pages efficiently

### 13.3 Maintainability
- platform modules must be separate from workflow modules
- tool contracts must be versionable
- core domain types must be centralized
- agents must remain narrow and composable

### 13.4 Extensibility
- new workflows must reuse core policy, audit, and runtime components
- new tools must be registerable without rewriting the runtime
- workflow state machine definitions must be modular

### 13.5 Explainability
- summaries must cite structured evidence references
- recommendations must be attributable to signals and policy context
- reviewer overrides must be visible for analysis

### 13.6 Security
- no unsafe query execution
- no unconstrained shell tools
- no arbitrary filesystem access
- no direct action from free-form model text
- strict input and output validation

---

## 14. Security Model

### 14.1 Principles
- deny by default
- least privilege
- typed boundaries
- parameterized data access
- explicit approvals
- audit everything
- no hidden side effects
- no free-form execution from AI output

### 14.2 Data Security
- all queries use parameterized access patterns (ORM only)
- no raw SQL from user prompts or model output
- read and write roles separated where possible
- sensitive actions require explicit review paths

### 14.3 Injection Defenses

Protect against: SQL injection, command injection, prompt-driven tool misuse, serialization abuse, malformed JSON, oversized payloads.

Rules:
- schema validation on every external payload
- allowlisted CLI argument patterns
- sanitized logging
- strict escaping in rendered views
- **never execute LLM-generated SQL**
- **never execute LLM-generated shell commands**

### 14.4 Tool Security
- each MCP tool has a typed request schema
- each tool has explicit permissions and actor checks
- tools are categorized: read / compute / action
- action tools are never available without stronger policy checks
- no generic eval or arbitrary execution tool exists

### 14.5 Auth and Roles

Roles: `analyst`, `reviewer`, `manager`, `admin`, `platform-engineer`, `workflow-agent`

Every action must record: actor type, actor identity, timestamp, case correlation ID.

### 14.6 Secrets and Configuration
- secrets only in environment/config vault-style sources
- no secrets inside prompts
- no secret values in logs
- environment profiles: local / dev / demo / prod
- CI secret scanning enabled

### 14.7 Audit Integrity
- append-only audit event pattern
- immutable event IDs
- trace IDs for every workflow
- replay support from persisted events

### 14.8 Approval Controls
- risky actions require reviewer approval
- override and escalation must capture reason code
- agent suspension and revocation require elevated privileges

### 14.9 LLM Boundaries
- LLM only sees structured evidence and allowed prompt context
- LLM does not have direct DB access
- LLM does not issue unrestricted tool calls on its own
- LLM output is treated as untrusted until validated by system logic

---

## 15. Architecture

### Components

**A. API Service** — REST endpoints, workflow initiation, review submission, admin actions, metrics

**B. Workflow Runtime** — state transitions, agent sequencing, tool dispatch, policy checkpoints, retries

**C. MCP Server** — tool registration, typed interfaces, tool discovery, permissioned execution, logging

**D. CLI** — ingestion, case inspection, review commands, replay, policy simulation, local dev

**E. Web App** — queue, case detail, evidence view, review actions, audit explorer, agent registry, dashboard

**F. Database** — domain records, workflow state, recommendations, reviews, audit events, policy events, agent registry, metrics snapshots

**G. Model Service Layer** — constrained summary generation, prompt templates, response validation

---

## 16. Analytics

### 16.1 Product Metrics
- average case assembly time
- average end-to-end review time
- queue backlog
- escalation rate
- recommendation acceptance rate
- override rate

### 16.2 Governance Metrics
- policy-blocked actions
- unauthorized tool access attempts
- agent suspension count
- audit coverage rate
- replay success rate

### 16.3 Workflow Quality Metrics
- evidence completeness
- summary usefulness proxy
- reviewer consistency
- false-positive tag rate
- request-more-context rate

### 16.4 Developer Usability Metrics
- CLI task completion speed
- tool contract validation pass rate
- onboarding time for new workflow module
- local replay reliability

---

## 17. Phases

| Phase | Deliverables |
|---|---|
| 0 | Naming, scope lock, architecture alignment |
| 1 | Platform foundation: repo, schema, API skeleton, workflow runtime, audit, policy, agent registry, local dev |
| 2 | MCP server: typed tools, permissions, logging, external client compatibility |
| 3 | CLI: command groups, JSON + human output, replay, ingest, review commands |
| 4 | Workflow 1: alert intake, retrieval, signals, evidence, summary, review lifecycle, policy checkpoints |
| 5 | Web app: queue, case detail, review controls, audit explorer, agent registry, dashboard |
| 6 | Security hardening: validation coverage, permission tests, query safety, role checks, logging review |
| 7 | Demo layer: README, architecture diagram, sample walkthrough, screenshots, CLI demo, portfolio write-up |
| 8 | Workflow extensions: KYC, customer servicing, payment exceptions, financial-crime triage, disputes |

---

## 18. MVP Definition

The MVP is complete when Mistsplitter can:

- ingest a suspicious transaction alert
- create a case
- gather structured context from SQL-backed records
- compute risk indicators
- assemble evidence
- generate bounded summary and recommendation
- enforce policy gates
- support human review
- persist audit logs
- expose tools through MCP
- operate through CLI
- present results through web UI
- support replay and inspection

---

## 19. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Overbuilding platform before proving value | Ship Workflow 1 fully before adding others |
| Agents too broad or autonomous | Keep agents narrow, permissioned, state-driven |
| Shallow fintech feel | Use realistic entities, workflows, case narratives, reason codes |
| LLM hallucination | Generate summaries only from structured evidence; validate outputs |
| Security claims become unrealistic | Position as secure-by-design, hardened against common risk classes — not infallible |
| Too much complexity for one iteration | Separate platform core from extension roadmap; enforce MVP scope |

---

## 20. Presentation Strategy

**What Mistsplitter is:** A governed MCP-native AI orchestration platform for fintech operations.

**What problem it solves:** Reduces repetitive evidence gathering and structures high-stakes operational review while preserving human control.

**What it is NOT:**
- a chatbot
- a generic agent demo
- an uncontrolled autonomous system

**What it IS:**
- workflow-driven
- policy-governed
- CLI-native
- MCP-native
- audit-centric
- security-conscious

**What a reviewer should notice immediately:**
- clear workflow orientation
- secure tool boundaries
- strong operational design
- terminal + web usability
- future-ready extensibility
- domain seriousness
