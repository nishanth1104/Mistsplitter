# Mistsplitter — Roadmap

All future workflows are modules on the same platform. They reuse: agent runtime, policy engine, audit system, MCP tool access, CLI conventions, web UI patterns, security model, and data governance model.

---

## Platform Stability First

No new workflow is started until Workflow 1 (`risk_review`) is:
- fully functional end-to-end
- tested
- demoed with synthetic data
- documented

The platform must prove itself before expanding.

---

## Workflow 2: KYC / Onboarding Review

**Domain:** Know Your Customer — identity verification and ongoing risk profiling

**Problem it solves:**  
KYC reviews are document-heavy, fragmented, and inconsistent. Reviewers spend time chasing incomplete profiles and cross-referencing identity signals manually.

**What the workflow does:**
- Ingests a KYC review trigger (new customer, periodic refresh, change in circumstances)
- Retrieves: identity documents, profile completeness status, risk tier, relationship context
- Computes: completeness score, risk tier indicators, document validity signals
- Assembles: evidence bundle with missing fields, risk flags, relationship map
- Generates: summary with recommendation (approve / request more info / escalate)
- Routes: to KYC analyst for review

**New data model needs:**
- `kyc_reviews` table — profile review records
- `identity_documents` table — document types, status, expiry
- `relationship_links` table — UBO chains, related parties

**New MCP tools needed:**
- `get_kyc_profile`
- `get_document_status`
- `compute_profile_completeness`
- `check_identity_signals`
- `submit_kyc_decision`

**New CLI commands:**
- `kyc ingest`
- `kyc show`
- `kyc review approve/reject/request`

---

## Workflow 3: Customer Support Escalation

**Domain:** Customer servicing — escalation routing and context handoff

**Problem it solves:**  
Support escalations lose context at handoff. Senior agents and specialist teams receive escalated cases without the full history, sentiment signals, or risk flags that should inform handling.

**What the workflow does:**
- Ingests a support ticket escalation event
- Retrieves: ticket history, customer profile, account context, prior interactions, open cases
- Computes: sentiment signals, escalation priority, risk overlap (does this touch AML/fraud?)
- Assembles: handoff packet with full context and recommended handling approach
- Routes: to appropriate team with context pre-loaded

**New data model needs:**
- `support_tickets` table
- `ticket_interactions` table
- `escalation_routes` table

**New MCP tools needed:**
- `get_ticket_history`
- `compute_sentiment_signals`
- `build_handoff_packet`
- `route_escalation`

---

## Workflow 4: Payment Exception Handling

**Domain:** Payments operations — failed payments, settlement mismatches, anomalies

**Problem it solves:**  
Payment exceptions are investigated manually, with context spread across payment rails, settlement systems, and customer records. Resolution is slow and inconsistent.

**What the workflow does:**
- Ingests a payment exception event (failed payment, settlement mismatch, reversal anomaly)
- Retrieves: payment record, account context, merchant context, settlement data
- Computes: exception type classification, impact severity, resolution signals
- Assembles: investigation packet with relevant context
- Routes: to payments ops team with recommended resolution path

**New data model needs:**
- `payment_exceptions` table
- `settlement_records` table

**New MCP tools needed:**
- `get_payment_exception`
- `classify_exception_type`
- `build_investigation_packet`
- `submit_resolution`

---

## Workflow 5: Financial-Crime Alert Triage

**Domain:** AML / Financial crime — alert queue management and prioritization

**Problem it solves:**  
AML teams receive high volumes of alerts. Triage is manual, slow, and inconsistent. High-priority cases get buried in noise.

**What the workflow does:**
- Ingests a batch of financial-crime alerts
- Scores and ranks by: signal strength, customer risk tier, pattern recurrence, network links
- Assembles: investigation-ready case packets for each alert above threshold
- Routes: ranked queue to AML analyst team

**New data model needs:**
- `triage_runs` table — batch triage execution records
- `network_links` table — entity relationship graph (simplified, no full graph DB in MVP)

**New MCP tools needed:**
- `batch_ingest_alerts`
- `compute_triage_score`
- `rank_alert_queue`
- `build_investigation_packet`

---

## Workflow 6: Dispute Evidence Review

**Domain:** Chargebacks and disputes — evidence collection for dispute resolution

**Problem it solves:**  
Dispute handlers spend time gathering evidence that is already in the system but fragmented. Evidence packets for chargeback responses are assembled manually.

**What the workflow does:**
- Ingests a dispute or chargeback event
- Retrieves: original transaction, merchant context, customer history, prior disputes
- Assembles: structured evidence packet meeting dispute response requirements
- Generates: summary suitable for dispute filing or internal decision
- Routes: to dispute handler or auto-packages for response

**New data model needs:**
- `disputes` table
- `dispute_evidence` table

**New MCP tools needed:**
- `get_dispute_context`
- `build_dispute_evidence_packet`
- `submit_dispute_decision`

---

## Platform Roadmap (non-workflow)

### Web UI enhancements
- Multi-workflow queue view (filter by workflow type)
- Cross-case link analysis view
- Bulk review tools for high-volume queues

### CLI enhancements
- Shell completions
- Interactive mode for review flows
- Batch ingest for multiple alerts

### MCP enhancements
- External client SDK
- Tool versioning and deprecation support
- Webhook callbacks for async tool completion

### Security hardening
- DB-level audit log protection (REVOKE DELETE on audit tables)
- Rate limiting on API endpoints
- Token-based auth (JWT or API key)
- Secret scanning in CI

### Analytics
- Time-series dashboard for all metrics
- Override pattern analysis
- Agent performance tracking
- Recommendation quality scoring

---

## What Stays Constant Across All Workflows

| Component | Shared? |
|---|---|
| Agent runtime | ✅ Always |
| Policy engine | ✅ Always |
| Audit system | ✅ Always |
| MCP tool infrastructure | ✅ Always |
| CLI command conventions | ✅ Always |
| Web UI layout patterns | ✅ Always |
| Security model | ✅ Always |
| TypeScript types foundation | ✅ Always |
| DB (PostgreSQL + Prisma) | ✅ Always |
| Seeding and demo infrastructure | ✅ Always |

New workflows add: domain-specific agents, domain-specific MCP tools, domain-specific DB tables, domain-specific signal logic, domain-specific prompts.

They never replace: the platform core.
