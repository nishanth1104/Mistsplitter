'use client'

import { useState, useEffect, useRef } from 'react'
import { AgentCard } from '@/components/AgentCard'
import { PipelineStrip } from '@/components/PipelineStrip'
import type { CaseListItem, AuditLogRow, CaseListResponse, AuditLogResponse } from '@/lib/types'

// ── Auth ──────────────────────────────────────────────────────────────────────
const AUTH = 'Bearer reviewer:web-user-1:Demo Reviewer'
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

// ── Agent definitions ─────────────────────────────────────────────────────────
const AGENTS = [
  {
    name: 'IntakeAgent', emoji: '📥',
    idleThoughts: [
      'Just waiting here...', 'Ready to intake!',
      'Reviewing alert schemas in my head', 'Coffee break ☕',
      'Alert queue is quiet...', 'Prepping my parser',
    ],
    activeThoughts: [
      'Parsing the alert payload...', 'Checking alert type against schema...',
      'Assigning severity level...', 'Creating the case record now...',
      'Normalizing fields...', 'Looks suspicious already...',
    ],
    doneResult: 'case record created',
  },
  {
    name: 'RetrievalAgent', emoji: '🔍',
    idleThoughts: [
      'Standing by for the next case...', 'Indexed some docs while waiting',
      '🎵 la la la...', 'DB connection is warm and ready',
      'Just browsing the schema...', 'Watching the query planner',
    ],
    activeThoughts: [
      'Pulling customer profile from DB...', 'Fetching 90 days of transaction history...',
      'Checking merchant risk tags...', 'Getting prior alerts...',
      'Loading account context...', 'That\'s a lot of data...',
    ],
    doneResult: 'context retrieved',
  },
  {
    name: 'SignalAgent', emoji: '⚡',
    idleThoughts: [
      'My 7 detectors are armed and ready', 'Running self-diagnostics...',
      'Waiting for evidence...', '🔍 Nothing to scan yet',
      'Sharpening my risk sensors', 'All thresholds calibrated',
    ],
    activeThoughts: [
      'Checking high amount threshold...', 'PEP status lookup...',
      'Counting transactions in 24h window...', 'Computing amount deviation from average...',
      'Cross-border flag check...', 'Scanning merchant category risk...',
    ],
    doneResult: '7 signals computed',
  },
  {
    name: 'EvidenceAgent', emoji: '🗂️',
    idleThoughts: [
      'Assembly line idle...', 'Waiting for signals...',
      'Organizing my toolbox 🔧', 'Ready to bundle!',
      'Keeping the folders tidy', 'Nothing to file... yet',
    ],
    activeThoughts: [
      'Bundling signals into evidence...', 'Structuring the evidence JSON...',
      'Linking entities to signals...', 'Building the case brief...',
      'Cross-referencing signal weights...', 'Almost done packaging...',
    ],
    doneResult: 'evidence bundle assembled',
  },
  {
    name: 'SummaryAgent', emoji: '🤖',
    idleThoughts: [
      'Warming up the LLM engine...', 'Thinking about narratives...',
      'GPT-4o-mini is ready 🚀', 'Awaiting evidence bundle',
      'Reading prior summaries for style...', 'Token budget checked ✓',
    ],
    activeThoughts: [
      'Crafting the narrative...', 'Asking GPT-4o-mini for help...',
      'Formatting the recommendation...', 'Almost done summarizing...',
      'Double-checking the output...', 'This looks like a risky one...',
    ],
    doneResult: 'recommendation generated',
  },
  {
    name: 'PolicyAgent', emoji: '⚖️',
    idleThoughts: [
      'Policy rules loaded ✅', 'Waiting for a case to evaluate...',
      'Reading the compliance handbook...', 'All gates are ready',
      'Reviewing threshold configs...', 'AML rules primed',
    ],
    activeThoughts: [
      'Evaluating risk thresholds...', 'Checking escalation rules...',
      'Consulting the policy engine...', 'Determining if human review is needed...',
      'Running rule chain...', 'Checking regulatory requirements...',
    ],
    doneResult: 'routed to human review',
  },
  {
    name: 'policy_gate', emoji: '🚦',
    idleThoughts: [
      'Gate is closed — waiting...', 'Access control armed ✋',
      'Standing at the checkpoint...', 'No one passes without clearance',
    ],
    activeThoughts: [
      'Policy decision received...', 'Opening the gate...',
      'Handing off to human reviewer...', 'Case cleared for review',
    ],
    doneResult: 'pipeline complete',
  },
] as const

// ── Workflow state → active agent index ───────────────────────────────────────
const WORKFLOW_TO_ACTIVE: Record<string, number> = {
  intake: 0,
  retrieving: 1,
  computing_signals: 2,
  assembling_evidence: 3,
  generating_summary: 4,
  awaiting_policy: 5,
  awaiting_review: 7,   // sentinel: all done
}

// ── Types ─────────────────────────────────────────────────────────────────────
type CardState = 'idle' | 'thinking' | 'done' | 'failed'

interface AgentViewState {
  name: string
  emoji: string
  cardState: CardState
  result: string | null
  errorMsg: string | null
}

// ── Pure helpers ──────────────────────────────────────────────────────────────
function deriveAgentStates(workflowState: string, logs: AuditLogRow[]): AgentViewState[] {
  const activeIndex = WORKFLOW_TO_ACTIVE[workflowState] ?? -1
  const failedActors = new Set(
    logs.filter((l) => l.action === 'agent.failed').map((l) => l.actorId),
  )

  return AGENTS.map((def, i) => {
    if (failedActors.has(def.name)) {
      const failLog = logs.find((l) => l.actorId === def.name && l.action === 'agent.failed')
      return {
        name: def.name, emoji: def.emoji,
        cardState: 'failed' as CardState,
        result: null,
        errorMsg: (failLog?.payloadJson as { error?: string })?.error ?? 'Step failed',
      }
    }

    let cardState: CardState
    if (activeIndex === 7) {
      cardState = 'done'
    } else if (i < activeIndex) {
      cardState = 'done'
    } else if (i === activeIndex) {
      cardState = 'thinking'
    } else {
      cardState = 'idle'
    }

    return {
      name: def.name, emoji: def.emoji,
      cardState,
      result: cardState === 'done' ? def.doneResult : null,
      errorMsg: null,
    }
  })
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function actionColor(action: string): string {
  if (action.startsWith('agent.')) return '#A977BF'
  if (action.startsWith('workflow.')) return '#60a5fa'
  if (action.startsWith('summary.')) return '#fbbf24'
  if (action.startsWith('policy.')) return '#2dd4bf'
  if (action.startsWith('review.')) return '#4ade80'
  if (action.startsWith('auth.')) return '#f87171'
  return '#704786'
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AgentWorkspacePage() {
  const [watchedCase, setWatchedCase] = useState<CaseListItem | null>(null)
  const [availableCases, setAvailableCases] = useState<CaseListItem[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [workflowState, setWorkflowState] = useState<string>('pending')
  const [agents, setAgents] = useState<AgentViewState[]>(
    AGENTS.map((a) => ({ name: a.name, emoji: a.emoji, cardState: 'idle', result: null, errorMsg: null })),
  )
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([])
  const [thoughtIndices, setThoughtIndices] = useState<number[]>(AGENTS.map(() => 0))
  const [pipelineStartedAt, setPipelineStartedAt] = useState<number | null>(null)
  const [llmCallCount, setLlmCallCount] = useState(0)
  const [now, setNow] = useState(Date.now())

  const selectedCaseIdRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const thoughtRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Data polling ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function poll() {
      const headers = { Authorization: AUTH }

      // 1. Fetch in_review cases
      let cases: CaseListItem[] = []
      try {
        const r = await fetch(`${API_BASE}/cases?status=in_review&limit=5`, { headers })
        const d = (await r.json()) as CaseListResponse
        cases = d.cases ?? []
      } catch { /* silent */ }

      // 2. Fallback to pending
      if (cases.length === 0) {
        try {
          const r = await fetch(`${API_BASE}/cases?status=pending&limit=5`, { headers })
          const d = (await r.json()) as CaseListResponse
          cases = d.cases ?? []
        } catch { /* silent */ }
      }

      setAvailableCases(cases)

      const targetId = selectedCaseIdRef.current ?? cases[0]?.caseId ?? null
      const watched = cases.find((c) => c.caseId === targetId) ?? cases[0] ?? null
      setWatchedCase(watched)

      if (!watched) return

      // 3. Fetch audit logs for watched case
      let logs: AuditLogRow[] = []
      try {
        const r = await fetch(
          `${API_BASE}/audit-logs?caseId=${watched.caseId}&limit=30`,
          { headers },
        )
        const d = (await r.json()) as AuditLogResponse
        logs = d.logs ?? []
      } catch { /* silent */ }

      const wfState = watched.workflowRuns[0]?.state ?? 'pending'
      setWorkflowState(wfState)
      setAuditLogs(logs.slice(0, 10))
      setAgents(deriveAgentStates(wfState, logs))
      setLlmCallCount(logs.filter((l) => l.action === 'summary.generation.started').length)

      setPipelineStartedAt((prev) => {
        if (prev !== null) return prev
        if (wfState === 'pending') return null
        const earliest = logs.reduce(
          (min, l) => (l.createdAt < min ? l.createdAt : min),
          logs[0]?.createdAt ?? new Date().toISOString(),
        )
        return new Date(earliest).getTime()
      })
    }

    poll()
    pollRef.current = setInterval(poll, 1500)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // ── Thought rotation ────────────────────────────────────────────────────────
  useEffect(() => {
    thoughtRef.current = setInterval(() => {
      setThoughtIndices((prev) =>
        prev.map((idx, i) => {
          const cardState = agents[i]?.cardState ?? 'idle'
          const arr = cardState === 'thinking' || cardState === 'done'
            ? AGENTS[i]!.activeThoughts
            : AGENTS[i]!.idleThoughts
          return (idx + 1) % arr.length
        }),
      )
    }, 2000)
    return () => { if (thoughtRef.current) clearInterval(thoughtRef.current) }
  }, [agents])

  // ── Clock for pipeline timer ────────────────────────────────────────────────
  useEffect(() => {
    clockRef.current = setInterval(() => setNow(Date.now()), 1000)
    return () => { if (clockRef.current) clearInterval(clockRef.current) }
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────────
  const activeIndex = WORKFLOW_TO_ACTIVE[workflowState] ?? -1
  const completedCount = agents.filter((a) => a.cardState === 'done').length
  const isLive = workflowState !== 'pending' && workflowState !== 'closed'
  const elapsedMs = pipelineStartedAt ? now - pipelineStartedAt : 0

  function getThought(i: number): string {
    const cardState = agents[i]?.cardState ?? 'idle'
    const arr = cardState === 'thinking' || cardState === 'done'
      ? [...AGENTS[i]!.activeThoughts]
      : [...AGENTS[i]!.idleThoughts]
    return arr[thoughtIndices[i]! % arr.length]!
  }

  function handleSelect(caseId: string) {
    selectedCaseIdRef.current = caseId
    setSelectedCaseId(caseId)
    setPipelineStartedAt(null)
  }

  const priorityColor: Record<string, string> = {
    critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      {/* ── Keyframe animations ───────────────────────────────────────── */}
      <style>{`
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes glow-purple {
          0%, 100% { box-shadow: 0 0 8px 2px rgba(141,95,165,0.3); }
          50%      { box-shadow: 0 0 24px 8px rgba(141,95,165,0.7); }
        }
        @keyframes glow-green {
          0%, 100% { box-shadow: 0 0 6px 1px rgba(34,197,94,0.2); }
          50%      { box-shadow: 0 0 18px 5px rgba(34,197,94,0.5); }
        }
        @keyframes glow-red {
          0%, 100% { box-shadow: 0 0 6px 1px rgba(239,68,68,0.2); }
          50%      { box-shadow: 0 0 18px 5px rgba(239,68,68,0.5); }
        }
        @keyframes live-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.25; }
        }
        @keyframes pipeline-flow {
          0%   { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }
        @keyframes thought-fade {
          0%   { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes step-ring {
          0%, 100% { box-shadow: 0 0 0 0 rgba(169,119,191,0.8); }
          50%      { box-shadow: 0 0 0 8px rgba(169,119,191,0); }
        }
      `}</style>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
          <div>
            <div style={{ color: '#E3C4E9', fontSize: '20px', fontWeight: 700, letterSpacing: '0.04em' }}>
              AGENT WORKSPACE
            </div>
            <div style={{ color: '#704786', fontSize: '12px', marginTop: '2px' }}>
              Real-time view of the risk_review pipeline
            </div>
          </div>

          {/* LIVE badge */}
          {isLive && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '20px', padding: '4px 10px',
              }}
            >
              <span
                style={{
                  display: 'inline-block', width: '7px', height: '7px',
                  borderRadius: '50%', background: '#ef4444',
                  animation: 'live-pulse 1.2s ease-in-out infinite',
                }}
              />
              <span style={{ color: '#ef4444', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em' }}>
                LIVE
              </span>
            </div>
          )}
        </div>

        {/* Case selector row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {watchedCase ? (
            <>
              <span style={{ color: '#A977BF', fontSize: '11px', fontFamily: 'monospace' }}>
                {watchedCase.caseId}
              </span>
              <span
                style={{
                  background: priorityColor[watchedCase.priority] + '22',
                  border: `1px solid ${priorityColor[watchedCase.priority]}44`,
                  color: priorityColor[watchedCase.priority],
                  borderRadius: '4px', padding: '2px 7px', fontSize: '9px',
                  fontWeight: 700, letterSpacing: '0.08em',
                }}
              >
                {watchedCase.priority.toUpperCase()}
              </span>
              <span style={{ color: '#704786', fontSize: '11px' }}>
                {watchedCase.alert.alertType}
              </span>
            </>
          ) : (
            <span style={{ color: '#462C55', fontSize: '12px' }}>No active case detected</span>
          )}

          {/* Case dropdown */}
          {availableCases.length > 1 && (
            <select
              value={selectedCaseId ?? ''}
              onChange={(e) => { if (e.target.value) handleSelect(e.target.value) }}
              style={{
                background: '#150c1e', border: '1px solid #2d1440',
                color: '#A977BF', borderRadius: '6px', padding: '4px 8px',
                fontSize: '11px', cursor: 'pointer',
              }}
            >
              <option value="">auto</option>
              {availableCases.map((c) => (
                <option key={c.caseId} value={c.caseId}>
                  {c.caseId.slice(-8)} · {c.priority} · {c.status}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Pipeline strip ────────────────────────────────────────────── */}
      <PipelineStrip agents={agents} activeIndex={activeIndex} />

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {!watchedCase && (
        <div
          style={{
            textAlign: 'center', padding: '60px 24px',
            color: '#462C55', fontSize: '14px',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🌌</div>
          <div style={{ color: '#704786', marginBottom: '8px' }}>No active workflows</div>
          <div style={{ fontSize: '12px' }}>
            Run <code style={{ color: '#A977BF', background: '#150c1e', padding: '2px 6px', borderRadius: '4px' }}>pnpm demo</code> to watch agents in action
          </div>
        </div>
      )}

      {/* ── Agent cards grid ──────────────────────────────────────────── */}
      {watchedCase && (
        <>
          {/* Row 1: 4 agents */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '16px',
              marginBottom: '16px',
            }}
          >
            {agents.slice(0, 4).map((agent, i) => (
              <AgentCard
                key={agent.name}
                name={agent.name}
                emoji={agent.emoji}
                cardState={agent.cardState}
                thought={getThought(i)}
                thoughtKey={thoughtIndices[i]!}
                result={agent.result}
                errorMsg={agent.errorMsg}
              />
            ))}
          </div>

          {/* Row 2: 3 agents centered */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '28px' }}>
            {agents.slice(4, 7).map((agent, j) => {
              const i = j + 4
              return (
                <div key={agent.name} style={{ width: 'calc(25% - 8px)' }}>
                  <AgentCard
                    name={agent.name}
                    emoji={agent.emoji}
                    cardState={agent.cardState}
                    thought={getThought(i)}
                    thoughtKey={thoughtIndices[i]!}
                    result={agent.result}
                    errorMsg={agent.errorMsg}
                  />
                </div>
              )
            })}
          </div>

          {/* ── Stats bar ──────────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex', gap: '32px', flexWrap: 'wrap',
              background: '#0d0815', border: '1px solid #2d1440',
              borderRadius: '10px', padding: '14px 20px',
              marginBottom: '24px',
            }}
          >
            {[
              { icon: '⏱', label: 'Pipeline running', value: pipelineStartedAt ? formatDuration(elapsedMs) : '—' },
              { icon: '✓', label: 'Agents completed', value: `${completedCount} / 7` },
              { icon: '◎', label: 'Current step', value: workflowState.replace(/_/g, ' ') },
              { icon: '🤖', label: 'LLM calls', value: String(llmCallCount) },
            ].map(({ icon, label, value }) => (
              <div key={label}>
                <div style={{ color: '#462C55', fontSize: '9px', letterSpacing: '0.08em', marginBottom: '3px' }}>
                  {icon} {label.toUpperCase()}
                </div>
                <div style={{ color: '#E3C4E9', fontSize: '14px', fontFamily: 'monospace' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* ── Live activity feed ─────────────────────────────────────── */}
          <div
            style={{
              background: '#0d0815', border: '1px solid #2d1440',
              borderRadius: '10px', overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 20px', borderBottom: '1px solid #2d1440',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <span style={{ color: '#704786', fontSize: '9px', letterSpacing: '0.12em' }}>
                LIVE ACTIVITY FEED
              </span>
              <span style={{ color: '#462C55', fontSize: '9px' }}>· last {auditLogs.length} events</span>
            </div>

            {auditLogs.length === 0 ? (
              <div style={{ padding: '24px 20px', color: '#462C55', fontSize: '12px' }}>
                Waiting for events...
              </div>
            ) : (
              <div>
                {auditLogs.map((log, i) => (
                  <div
                    key={log.logId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '16px',
                      padding: '8px 20px',
                      background: i % 2 === 0 ? '#150c1e' : 'transparent',
                      borderBottom: '1px solid #1a0f22',
                    }}
                  >
                    <span style={{ color: '#462C55', fontSize: '10px', fontFamily: 'monospace', whiteSpace: 'nowrap', minWidth: '70px' }}>
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                    <span style={{ color: '#704786', fontSize: '10px', fontFamily: 'monospace', minWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.actorId}
                    </span>
                    <span style={{ color: actionColor(log.action), fontSize: '10px', fontFamily: 'monospace' }}>
                      {log.action}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
