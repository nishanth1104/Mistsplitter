import { apiFetch } from '@/lib/api'
import type { MetricsResponse, CaseListResponse, CaseStatus } from '@/lib/types'

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
const STATUS_COLORS: Record<CaseStatus, string> = {
  pending:         'bg-gray-600',
  in_review:       'bg-blue-600',
  escalated:       'bg-orange-600',
  closed_clear:    'bg-green-600',
  closed_actioned: 'bg-red-600',
}
const STATUS_LABELS: Record<CaseStatus, string> = {
  pending:         'Pending',
  in_review:       'In Review',
  escalated:       'Escalated',
  closed_clear:    'Closed · Clear',
  closed_actioned: 'Closed · Actioned',
}

export default async function DashboardPage() {
  const [metricsData, casesData] = await Promise.all([
    apiFetch<MetricsResponse>('/metrics').catch(() => ({ metrics: [] })),
    apiFetch<CaseListResponse>('/cases?limit=200').catch(() => ({ cases: [], total: 0, limit: 200, offset: 0 })),
  ])

  // Status breakdown
  const statusCounts = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: 0 }), {})
  for (const c of casesData.cases) {
    if (c.status in statusCounts) statusCounts[c.status]!++
  }
  const total = casesData.total || 1

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#E3C4E9]">Dashboard</h1>
        <p className="text-[#704786] text-sm mt-1">Mistsplitter — Governed AI Fintech Operations</p>
      </div>

      {/* Metrics cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {metricsData.metrics.map((m) => (
          <div key={m.metricName} className="bg-[#1a0f22] border border-[#462C55] rounded-lg p-4">
            <div className="text-[#704786] text-xs uppercase tracking-wide mb-2">
              {METRIC_LABELS[m.metricName] ?? m.metricName}
            </div>
            <div className="text-[#E3C4E9] text-2xl font-bold">
              {formatMetricValue(m.metricName, m.metricValue)}
            </div>
          </div>
        ))}
      </div>

      {/* Case status breakdown */}
      <div className="bg-[#1a0f22] border border-[#462C55] rounded-lg p-6 mb-6">
        <h2 className="text-[#A977BF] font-semibold mb-4">Case Queue — {casesData.total} total</h2>

        {/* Bar */}
        <div className="flex rounded-full overflow-hidden h-4 mb-4">
          {STATUS_ORDER.map((s) => {
            const pct = (statusCounts[s]! / total) * 100
            if (pct === 0) return null
            return (
              <div
                key={s}
                className={`${STATUS_COLORS[s]} h-full`}
                style={{ width: `${pct}%` }}
                title={`${STATUS_LABELS[s]}: ${statusCounts[s]}`}
              />
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4">
          {STATUS_ORDER.map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[s]}`} />
              <span className="text-[#A977BF] text-xs">{STATUS_LABELS[s]}</span>
              <span className="text-[#E3C4E9] text-xs font-bold">{statusCounts[s]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { href: '/cases', label: 'Review Queue', sub: `${statusCounts['pending'] ?? 0} pending` },
          { href: '/cases?status=escalated', label: 'Escalated', sub: `${statusCounts['escalated'] ?? 0} cases` },
          { href: '/audit', label: 'Audit Trail', sub: 'All events' },
          { href: '/agents', label: 'Agents', sub: '7 registered' },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="bg-[#1a0f22] border border-[#462C55] hover:border-[#704786] rounded-lg p-4 transition-colors"
          >
            <div className="text-[#E3C4E9] font-medium">{link.label}</div>
            <div className="text-[#704786] text-xs mt-1">{link.sub}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
