# Mistsplitter — Security Model

---

## Philosophy

The goal is not to claim "unbreakable" security.

The goal is to design a **secure-by-default system** that:
- minimizes common attack surfaces
- makes dangerous operations structurally impossible, not just prohibited by convention
- ensures every meaningful action is attributable and auditable
- treats LLM output as untrusted input

Security is a **core product feature**, not a non-functional requirement tacked on at the end.

---

## Principles

| Principle | What it means in practice |
|---|---|
| Deny by default | Everything is blocked unless explicitly permitted |
| Least privilege | Agents, tools, and roles get exactly the access they need — nothing more |
| Typed boundaries | All inputs and outputs are schema-validated |
| Parameterized data access | ORM only — no raw SQL assembled from external input |
| Explicit approvals | Action-tier operations require policy clearance and human review |
| Audit everything | No meaningful action occurs without an audit log entry |
| No hidden side effects | Tool effects are declared, logged, and bounded |
| No free-form execution from AI | LLM output is never executed as code, SQL, or shell commands |

---

## Threat Model

### Threats in scope

**SQL Injection**
- Attack: user input or LLM output used to assemble raw SQL queries
- Mitigation: Prisma ORM exclusively. Zero raw SQL in application code. This is enforced architecturally, not just by convention.

**Command Injection**
- Attack: LLM output or user input passed to `exec()`, `spawn()`, or shell evaluation
- Mitigation: No shell execution in application code. CLI arguments are allowlisted and parsed by Commander.js — never passed to shell directly.

**Prompt Injection**
- Attack: malicious data in a retrieved record causes LLM to take unintended actions
- Mitigation: LLM (SummaryAgent) only receives structured, pre-validated evidence bundle. It does not receive raw user input or unvalidated DB content. LLM output is validated by Zod before use.

**Tool Misuse by Agents**
- Attack: an agent calls a tool outside its permitted scope
- Mitigation: Each agent has an explicit `approved_tools` allowlist in the agent registry. MCP server enforces this — calls from an agent to an unauthorized tool are rejected and logged.

**Privilege Escalation**
- Attack: a lower-privilege actor performs an action requiring higher privilege
- Mitigation: Role-based auth middleware on every API route. Tool-level actor checks on every MCP tool call. Action-tier tools require `reviewer` or higher.

**Audit Tampering**
- Attack: audit records modified or deleted to conceal activity
- Mitigation: Append-only pattern enforced in application code. No update or delete methods exist on audit_logs or policy_events in the data access layer.

**Secret Leakage**
- Attack: API keys, DB credentials, or other secrets appear in logs, error messages, or prompts
- Mitigation: Secrets loaded from environment only. Structured logger explicitly strips known secret field names. Prompts never contain secret values.

**Oversized / Malformed Payloads**
- Attack: sending malformed JSON or extremely large payloads to crash or destabilize the service
- Mitigation: Zod schema validation on every external payload. API body size limits configured at server level.

**Replay Attacks**
- Attack: replaying a valid past request to trigger duplicate case creation or duplicate review submission
- Mitigation: Idempotency keys on case creation. Workflow runtime detects duplicate correlation IDs.

### Threats out of scope for MVP
- Nation-state attacks
- Physical access to infrastructure
- Side-channel attacks
- Supply chain attacks on npm dependencies
- Social engineering

---

## Data Security

### ORM-only data access
All database operations go through Prisma. There is no raw SQL anywhere in application code. This is not just a code style choice — it is an architectural constraint that eliminates a class of injection vulnerabilities.

**Prohibited patterns (never write these):**
```typescript
// NEVER — raw SQL from any external source
db.query(`SELECT * FROM cases WHERE id = '${caseId}'`)

// NEVER — LLM-generated query execution
eval(llmOutput)
db.query(llmOutput)
```

**Correct pattern:**
```typescript
// Always — parameterized through Prisma
const case = await prisma.cases.findUnique({ where: { case_id: caseId } })
```

### Read / Write separation
- Retrieval agents use read-only DB access
- Write operations are confined to: case creation, review submission, audit logging, metrics updates
- Future: separate DB roles for read and write paths

### Sensitive field handling
- No PII in log payloads beyond what is strictly necessary for audit
- Customer names and account details are not logged in full — reference by ID
- Amount values in audit logs are acceptable for AML traceability

---

## Tool Security

### Tool categories and permission tiers

| Category | Examples | Who can call | Policy required |
|---|---|---|---|
| `read` | `get_case`, `get_customer_profile` | Any registered agent | No |
| `compute` | `compute_risk_signals`, `build_evidence_bundle` | Agents with compute scope | No |
| `action` | `submit_review`, `suspend_agent` | Reviewer role or above | Yes — explicit approval |

### Tool call validation
Every MCP tool call goes through:
1. Schema validation (Zod) — reject malformed input
2. Actor authentication — who is calling?
3. Permission check — is this actor allowed to call this tool?
4. Policy check (for action-tier tools) — is this action permitted right now?
5. Execution
6. Audit log entry — always, even on failure

### No escape hatches
There is no `execute_sql`, `run_command`, `eval_code`, or equivalent tool in the MCP registry. These do not exist and must never be added.

---

## LLM Boundaries

### What the LLM can see
- Structured evidence bundle (validated JSON)
- Prompt template with injected evidence fields
- Case metadata (ID, severity, alert type)

### What the LLM cannot see
- Raw database records
- Unvalidated external input
- Customer PII beyond what is in the structured evidence bundle
- Secrets, configuration, or system internals

### What the LLM can produce
- A narrative summary string
- A recommended action (one of: `clear`, `review_further`, `escalate`)
- A confidence level

### What happens to LLM output
1. Output is received as a string
2. Parsed and validated against a Zod schema
3. If validation fails → logged as error, workflow step marked failed, human notified
4. If validation passes → stored as recommendation record

LLM output is **never**:
- Executed as code
- Used as a SQL query
- Passed to a shell
- Used directly to trigger an action without human review

---

## Auth and Roles

### Role definitions

| Role | Access |
|---|---|
| `analyst` | Read cases, read evidence, read recommendations |
| `reviewer` | All analyst access + submit reviews, approve/override |
| `manager` | All reviewer access + view overrides, access analytics |
| `admin` | All access + suspend/revoke agents, manage policy |
| `platform-engineer` | All access + system config, local dev operations |
| `workflow-agent` | Scoped tool access only — defined per agent in registry |

### Every action must record
- `actor_type` — agent, reviewer, system, cli, api
- `actor_id` — identity string (user ID or agent ID)
- `action` — standardized action string
- `case_id` — where applicable
- `created_at` — always UTC

---

## Secrets and Configuration

### Rules
- Secrets live in environment variables or a secrets manager — never in code
- `.env` files are gitignored. `.env.example` is committed with placeholder values only
- No secret values in log output
- No secret values in error messages returned to clients
- No secret values injected into LLM prompts

### Environment profiles

| Profile | Secret source |
|---|---|
| `local` | `.env.local` (gitignored) |
| `dev` | Environment variables in dev infra |
| `demo` | Environment variables with demo credentials |
| `prod` | Secrets manager (future) |

### CI
- Secret scanning enabled in CI pipeline
- Any commit containing a pattern matching common secret formats (API keys, connection strings) is flagged

---

## Audit Integrity

### Append-only enforcement
The `packages/audit/src/logger.ts` module is the **only** approved path for writing audit events. It:
- generates immutable ULIDs for each event
- writes with a timestamp set by the server (not the client)
- never exposes an update or delete method

Database-level enforcement (future hardening):
```sql
-- Revoke DELETE on audit_logs for application DB role
REVOKE DELETE ON audit_logs FROM app_role;
REVOKE UPDATE ON audit_logs FROM app_role;
```

### Replay
Any case can be replayed from its audit log. The `packages/audit/src/replay.ts` module fetches the ordered event stream for a `case_id` and returns it in creation order.

---

## Approval Controls

### What requires explicit human approval
- Overriding an agent recommendation (must supply reason code)
- Escalating a case (must supply escalation reason)
- Suspending an agent (requires `admin` or `platform-engineer` role)
- Revoking an agent (requires `admin` role, confirmation prompt in CLI)

### CLI confirmation flows
Sensitive CLI commands display a confirmation prompt before executing:
```
> mistsplitter agent revoke agent_01JXYZ123
This will permanently revoke IntakeAgent. This cannot be undone.
Type the agent name to confirm: IntakeAgent
```

---

## Error Handling

### Rules
- Never expose stack traces to API clients
- Never expose internal field names or DB schema details in error responses
- All errors return a consistent structure: `{ error: string, code: string }`
- All errors are logged internally with full context
- Validation errors return a 400 with field-level detail (Zod parse errors mapped to client-safe format)

### What not to do
```typescript
// NEVER — exposes internals
res.status(500).json({ error: err.message, stack: err.stack })

// NEVER — swallows the error
try { ... } catch { }

// CORRECT
logger.error({ err, case_id, actor_id }, 'Tool call failed')
res.status(500).json({ error: 'Internal error', code: 'TOOL_CALL_FAILED' })
```

---

## Limitations

This security model is designed to be honest about what it achieves:

- It eliminates common web application attack surfaces
- It prevents LLM output from directly triggering system actions
- It makes audit trails tamper-evident at the application layer
- It enforces least privilege through architecture, not just policy

It does **not** claim to be:
- Compliant with any specific regulation (SOC2, PCI-DSS, etc.)
- Resistant to all supply chain or infrastructure-level attacks
- A replacement for a professional security audit in a production environment
