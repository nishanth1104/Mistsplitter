/**
 * Mistsplitter — Full Workflow Demo
 *
 * Demonstrates the complete risk_review pipeline end-to-end via the REST API.
 *
 * Prerequisites:
 *   1. pnpm db:seed          — seed synthetic case data
 *   2. pnpm serve:api        — start API server on :3000
 *
 * Usage:
 *   pnpm demo
 *   pnpm tsx scripts/demo.ts
 */

// ── ANSI colour helpers ───────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  purple: '\x1b[35m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  brightPurple: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
}

const fmt = {
  header: (s: string) => `${c.bold}${c.brightPurple}${s}${c.reset}`,
  step: (n: number, s: string) => `${c.bold}${c.purple}[${n}]${c.reset} ${c.brightWhite}${s}${c.reset}`,
  label: (s: string) => `${c.dim}${s}${c.reset}`,
  ok: (s: string) => `${c.green}✓${c.reset} ${s}`,
  warn: (s: string) => `${c.yellow}⚠${c.reset}  ${s}`,
  err: (s: string) => `${c.red}✗${c.reset} ${s}`,
  badge: (label: string, val: string, colour: string) =>
    `  ${c.dim}${label.padEnd(20)}${c.reset}${colour}${val}${c.reset}`,
  divider: () => `${c.dim}${'─'.repeat(60)}${c.reset}`,
  indent: (s: string) => `  ${s}`,
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── API client ────────────────────────────────────────────────────────────────

const API_BASE = process.env['API_URL'] ?? 'http://localhost:3000'
const AUTH = 'Bearer reviewer:demo-user-1:Demo User'

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CaseListItem {
  caseId: string
  status: string
  priority: string
  alert?: { alertType: string; severity: string }
  workflowRuns: Array<{ state: string; status: string; startedAt: string }>
}

interface CaseListResponse { cases: CaseListItem[]; total: number }

interface WorkflowStartResponse { runId: string; caseId: string; status: string }

interface CaseDetail {
  case: {
    caseId: string
    status: string
    priority: string
    correlationId: string
    alert: {
      alertType: string
      severity: string
      transaction?: { amount: string; currency: string; channel: string }
    }
    workflowRuns: Array<{ runId: string; state: string; status: string; startedAt: string; endedAt?: string }>
    recommendations: Array<{ recommendedAction: string; confidence: string; summary: string }>
    reviews: Array<{ reviewerId: string; finalAction: string; reviewedAt: string }>
  }
}

interface AuditResponse {
  logs: Array<{ logId: string; actorId: string; actorRole: string; action: string; createdAt: string }>
  total: number
}

interface ReviewResponse { reviewId: string; finalAction: string; caseStatus: string }

// ── Banner ────────────────────────────────────────────────────────────────────

function printBanner(): void {
  console.log()
  console.log(fmt.divider())
  console.log(fmt.header('  MISTSPLITTER — Full Workflow Demo'))
  console.log(fmt.label('  Governed AI orchestration for fintech operations'))
  console.log(fmt.divider())
  console.log()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  printBanner()
  const startTime = Date.now()

  // ── Step 1: Health check ──────────────────────────────────────────────────
  console.log(fmt.step(1, 'Checking API server...'))
  try {
    const res = await fetch(`${API_BASE}/health`)
    if (!res.ok) throw new Error('not ok')
    console.log(fmt.indent(fmt.ok(`API server reachable at ${API_BASE}`)))
  } catch {
    console.log(fmt.indent(fmt.err(`Cannot reach API at ${API_BASE}`)))
    console.log(fmt.indent(fmt.warn('Start the API server first: pnpm serve:api')))
    process.exit(1)
  }
  console.log()
  await sleep(400)

  // ── Step 2: Find a pending case ───────────────────────────────────────────
  console.log(fmt.step(2, 'Finding a pending case to process...'))
  const caseList = await api<CaseListResponse>('GET', '/cases?status=pending&limit=5')

  if (caseList.cases.length === 0) {
    console.log(fmt.indent(fmt.err('No pending cases found.')))
    console.log(fmt.indent(fmt.warn('Run pnpm db:seed to create demo data, then try again.')))
    process.exit(1)
  }

  // Prefer a case with no workflow runs yet (never processed)
  const unprocessed = caseList.cases.find((c) => c.workflowRuns.length === 0)
  const chosen = unprocessed ?? caseList.cases[0]!
  const caseId = chosen.caseId

  console.log(fmt.badge('Case ID', caseId, c.brightCyan))
  console.log(fmt.badge('Status', chosen.status, c.yellow))
  console.log(fmt.badge('Priority', chosen.priority, c.brightWhite))
  if (chosen.alert) {
    console.log(fmt.badge('Alert type', chosen.alert.alertType, c.white))
    console.log(fmt.badge('Severity', chosen.alert.severity, c.yellow))
  }
  console.log()
  await sleep(500)

  // ── Step 3: Start workflow ────────────────────────────────────────────────
  console.log(fmt.step(3, 'Starting risk_review workflow...'))
  let workflowRes: WorkflowStartResponse
  try {
    workflowRes = await api<WorkflowStartResponse>('POST', `/cases/${caseId}/run`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('409')) {
      console.log(fmt.indent(fmt.warn('Workflow already running for this case — choosing another.')))
      // Fall back to any pending case that has no runs
      const fresh = caseList.cases.find((c) => c.caseId !== caseId && c.workflowRuns.length === 0)
      if (!fresh) {
        console.log(fmt.indent(fmt.err('No fresh pending cases available. Run pnpm db:seed and try again.')))
        process.exit(1)
      }
      workflowRes = await api<WorkflowStartResponse>('POST', `/cases/${fresh.caseId}/run`)
    } else {
      throw e
    }
  }

  console.log(fmt.badge('Run ID', workflowRes.runId, c.brightCyan))
  console.log(fmt.badge('Status', workflowRes.status, c.yellow))
  console.log()

  // ── Step 4: Poll agents ───────────────────────────────────────────────────
  console.log(fmt.step(4, 'Watching agent pipeline execute...'))
  console.log()

  const stateLabels: Record<string, string> = {
    intake_started:    '  ▸ IntakeAgent      → validating alert, creating case',
    intake_complete:   '  ▸ RetrievalAgent   → fetching customer, account, transaction history',
    retrieval_complete:'  ▸ SignalAgent       → computing 7 risk signals',
    signals_computed:  '  ▸ EvidenceAgent    → assembling evidence bundle',
    evidence_assembled:'  ▸ SummaryAgent     → generating narrative (Claude Haiku)',
    summary_generated: '  ▸ PolicyAgent      → evaluating workflow gate',
    policy_permitted:  '  ✓ Pipeline complete → awaiting human review',
    awaiting_review:   '  ✓ Pipeline complete → awaiting human review',
  }

  let caseData: CaseDetail | null = null
  let lastState = ''
  let attempts = 0

  while (attempts < 60) {
    await sleep(1500)
    attempts++

    caseData = await api<CaseDetail>('GET', `/cases/${caseId}`)
    const run = caseData.case.workflowRuns[0]
    if (!run) continue

    if (run.state !== lastState && stateLabels[run.state]) {
      const label = stateLabels[run.state]!
      const color = run.state.startsWith('awaiting') || run.state === 'policy_permitted'
        ? c.green : c.brightPurple
      console.log(`${color}${label}${c.reset}`)
      lastState = run.state
    }

    if (run.status === 'success' || run.status === 'failed' || run.state === 'awaiting_review') {
      break
    }
  }

  if (!caseData) {
    console.log(fmt.indent(fmt.err('Timed out waiting for workflow.')))
    process.exit(1)
  }

  const finalRun = caseData.case.workflowRuns[0]
  console.log()

  if (finalRun?.status === 'failed') {
    console.log(fmt.indent(fmt.err(`Workflow failed in state: ${finalRun.state}`)))
    process.exit(1)
  }

  console.log(fmt.indent(fmt.ok(`All agents completed — state: ${finalRun?.state ?? 'unknown'}`)))
  console.log()
  await sleep(400)

  // ── Step 5: Recommendation ────────────────────────────────────────────────
  console.log(fmt.step(5, 'AI Recommendation'))
  const rec = caseData.case.recommendations[0]

  if (rec) {
    const actionColor =
      rec.recommendedAction === 'clear' ? c.green
      : rec.recommendedAction === 'escalate' ? c.red
      : c.yellow

    console.log(fmt.badge('Action', rec.recommendedAction.toUpperCase(), actionColor))
    console.log(fmt.badge('Confidence', rec.confidence, c.brightCyan))
    console.log()
    console.log(`  ${c.dim}Summary:${c.reset}`)

    const words = rec.summary.split(' ')
    let line = '  '
    for (const word of words) {
      if (line.length + word.length > 62) {
        console.log(`${c.white}${line}${c.reset}`)
        line = '  ' + word + ' '
      } else {
        line += word + ' '
      }
    }
    if (line.trim()) console.log(`${c.white}${line}${c.reset}`)
  } else {
    console.log(fmt.indent(fmt.warn('No recommendation generated yet.')))
  }
  console.log()
  await sleep(600)

  // ── Step 6: Human review ──────────────────────────────────────────────────
  console.log(fmt.step(6, 'Submitting human review...'))

  const reviewRes = await api<ReviewResponse>('POST', `/cases/${caseId}/reviews`, {
    finalAction: 'approved',
    overrideFlag: false,
    notes: 'Signals consistent with known pattern. Approved via demo run.',
  })

  console.log(fmt.indent(fmt.ok('Review submitted')))
  console.log(fmt.badge('Review ID', reviewRes.reviewId, c.brightCyan))
  console.log(fmt.badge('Final action', reviewRes.finalAction, c.green))
  console.log(fmt.badge('Case status', reviewRes.caseStatus, c.green))
  console.log()
  await sleep(400)

  // ── Step 7: Audit trail ───────────────────────────────────────────────────
  console.log(fmt.step(7, 'Audit Trail'))
  const auditRes = await api<AuditResponse>('GET', `/audit-logs?caseId=${caseId}&limit=20`)

  console.log(fmt.indent(`${c.dim}${auditRes.total} events recorded for this case${c.reset}`))
  console.log()

  const actionColor = (action: string): string => {
    if (action.startsWith('case.')) return c.cyan
    if (action.startsWith('workflow.')) return c.purple
    if (action.startsWith('agent.')) return c.brightPurple
    if (action.startsWith('review.')) return c.green
    if (action.startsWith('tool.')) return c.yellow
    return c.white
  }

  for (const log of [...auditRes.logs].reverse()) {
    const time = new Date(log.createdAt).toLocaleTimeString()
    console.log(
      `  ${c.dim}${time}${c.reset}  ` +
      `${actionColor(log.action)}${log.action.padEnd(30)}${c.reset}` +
      `${c.dim}${log.actorId}${c.reset}`,
    )
  }
  console.log()

  // ── Done ──────────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(fmt.divider())
  console.log(fmt.header('  Demo complete'))
  console.log()
  console.log(fmt.indent(`${c.dim}Case    ${c.brightCyan}${caseId}${c.reset}`))
  console.log(fmt.indent(`${c.dim}Runtime ${c.brightCyan}${elapsed}s${c.reset}`))
  console.log()
  console.log(fmt.indent(`${c.dim}Web UI  ${c.brightCyan}http://localhost:3002/cases/${caseId}${c.reset}`))
  console.log(fmt.indent(`${c.dim}Audit   ${c.brightCyan}http://localhost:3002/audit${c.reset}`))
  console.log(fmt.divider())
  console.log()
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`\n${c.red}✗ Demo failed:${c.reset} ${message}\n`)
  process.exit(1)
})
