import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import type { CaseListResponse } from '@/lib/types'
import { StatusBadge } from '@/components/StatusBadge'
import { PriorityBadge } from '@/components/PriorityBadge'

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

export default async function CasesPage({
  searchParams,
}: {
  searchParams: { status?: string; priority?: string }
}) {
  const params = new URLSearchParams({ limit: '100' })
  if (searchParams.status) params.set('status', searchParams.status)
  if (searchParams.priority) params.set('priority', searchParams.priority)

  const data = await apiFetch<CaseListResponse>(`/cases?${params.toString()}`).catch(() => ({
    cases: [],
    total: 0,
    limit: 100,
    offset: 0,
  }))

  const cases = [...data.cases].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4),
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Case Queue</h1>
          <p className="text-muted-foreground text-sm mt-1">{data.total} cases total</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {['', 'pending', 'in_review', 'escalated', 'closed_clear', 'closed_actioned'].map((s) => (
            <a
              key={s}
              href={s ? `/cases?status=${s}` : '/cases'}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                (searchParams.status ?? '') === s
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                  : 'bg-card border-border text-muted-foreground hover:border-cyan-500/30 hover:text-foreground'
              }`}
            >
              {s || 'All'}
            </a>
          ))}
        </div>
      </div>

      {cases.length === 0 ? (
        <div className="text-muted-foreground text-center py-16">No cases found.</div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Case ID', 'Status', 'Priority', 'Alert Type', 'Severity', 'Recommendation', 'Created'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const rec = c.recommendations[0]
                return (
                  <tr
                    key={c.caseId}
                    className="border-b border-border/50 hover:bg-accent/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/cases/${c.caseId}`} className="text-cyan-400 hover:text-cyan-300 font-mono text-xs transition-colors">
                        {c.caseId.slice(0, 24)}…
                      </Link>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={c.priority} /></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{c.alert?.alertType ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{c.alert?.severity ?? '—'}</td>
                    <td className="px-4 py-3">
                      {rec ? (
                        <span className={`text-xs font-medium ${
                          rec.recommendedAction === 'clear'    ? 'text-emerald-400'
                          : rec.recommendedAction === 'escalate' ? 'text-rose-400'
                          : 'text-amber-400'
                        }`}>
                          {rec.recommendedAction}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
