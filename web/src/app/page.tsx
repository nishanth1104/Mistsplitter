import { apiFetch } from '@/lib/api'
import type { MetricsResponse, CaseListResponse, AgentListResponse, CaseStatus } from '@/lib/types'

const METRIC_LABELS: Record<string, string> = {
  queue_backlog:           'Queue Backlog',
  override_rate:           'Override Rate',
  avg_review_time_seconds: 'Avg Review Time',
  escalation_rate:         'Escalation Rate',
  acceptance_rate:         'Acceptance Rate',
}

function formatMetricValue(name: string, value: string): string {
  const n = parseFloat(value)
  if (name.includes('rate')) return `${(n * 100).toFixed(1)}%`
  if (name.includes('time_seconds')) return `${Math.round(n)}s`
  return value
}

const STATUS_ORDER: CaseStatus[] = ['pending', 'in_review', 'escalated', 'closed_clear', 'closed_actioned']
const STATUS_BAR_COLOR: Record<CaseStatus, string> = {
  pending:         'bg-slate-500',
  in_review:       'bg-blue-500',
  escalated:       'bg-orange-500',
  closed_clear:    'bg-emerald-500',
  closed_actioned: 'bg-rose-500',
}
const STATUS_DOT: Record<CaseStatus, string> = {
  pending:         'bg-slate-400',
  in_review:       'bg-blue-400',
  escalated:       'bg-orange-400',
  closed_clear:    'bg-emerald-400',
  closed_actioned: 'bg-rose-400',
}
const STATUS_LABELS: Record<CaseStatus, string> = {
  pending:         'Pending',
  in_review:       'In Review',
  escalated:       'Escalated',
  closed_clear:    'Closed · Clear',
  closed_actioned: 'Closed · Actioned',
}

export default async function DashboardPage() {
  const [metricsData, casesData, agentData] = await Promise.all([
    apiFetch<MetricsResponse>('/metrics').catch(() => ({ metrics: [] })),
    apiFetch<CaseListResponse>('/cases?limit=200').catch(() => ({ cases: [], total: 0, limit: 200, offset: 0 })),
    apiFetch<AgentListResponse>('/agents').catch(() => ({ agents: [], total: 0 })),
  ])

  const statusCounts = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: 0 }), {})
  for (const c of casesData.cases) {
    if (c.status in statusCounts) statusCounts[c.status]!++
  }
  const total = casesData.total || 1

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Mistsplitter — Governed AI Fintech Operations</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {metricsData.metrics.map((m) => (
          <div
            key={m.metricName}
            className="bg-card border border-border rounded-lg p-4 border-l-4 border-l-cyan-500"
          >
            <div className="text-muted-foreground text-xs uppercase tracking-wide mb-2 font-medium">
              {METRIC_LABELS[m.metricName] ?? m.metricName}
            </div>
            <div className="text-foreground text-2xl font-bold font-mono">
              {formatMetricValue(m.metricName, m.metricValue)}
            </div>
          </div>
        ))}
      </div>

      {/* Case queue status */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="text-foreground font-semibold mb-4">
          Case Queue
          <span className="text-muted-foreground font-normal ml-2 text-sm">— {casesData.total} total</span>
        </h2>
        <div className="flex rounded-full overflow-hidden h-3 mb-5 bg-muted">
          {STATUS_ORDER.map((s) => {
            const pct = (statusCounts[s]! / total) * 100
            if (pct === 0) return null
            return (
              <div
                key={s}
                className={`${STATUS_BAR_COLOR[s]} h-full transition-all`}
                style={{ width: `${pct}%` }}
                title={`${STATUS_LABELS[s]}: ${statusCounts[s]}`}
              />
            )
          })}
        </div>
        <div className="flex flex-wrap gap-5">
          {STATUS_ORDER.map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[s]}`} />
              <span className="text-muted-foreground text-xs">{STATUS_LABELS[s]}</span>
              <span className="text-foreground text-xs font-bold font-mono">{statusCounts[s]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { href: '/cases',                  label: 'Review Queue',  sub: `${statusCounts['pending'] ?? 0} pending` },
          { href: '/cases?status=escalated', label: 'Escalated',     sub: `${statusCounts['escalated'] ?? 0} cases` },
          { href: '/audit',                  label: 'Audit Trail',   sub: 'All events' },
          { href: '/agents',                 label: 'Agents',        sub: `${agentData.total} registered` },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="bg-card border border-border hover:border-cyan-500/50 hover:bg-accent/50 rounded-lg p-4 transition-all group"
          >
            <div className="text-foreground font-medium group-hover:text-cyan-400 transition-colors">
              {link.label}
            </div>
            <div className="text-muted-foreground text-xs mt-1">{link.sub}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
