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

  // Sort by priority
  const cases = [...data.cases].sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4),
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#E3C4E9]">Case Queue</h1>
          <p className="text-[#704786] text-sm mt-1">{data.total} cases total</p>
        </div>

        {/* Status filter */}
        <div className="flex gap-2">
          {['', 'pending', 'in_review', 'escalated', 'closed_clear', 'closed_actioned'].map((s) => (
            <a
              key={s}
              href={s ? `/cases?status=${s}` : '/cases'}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                (searchParams.status ?? '') === s
                  ? 'bg-[#704786] text-white'
                  : 'bg-[#1a0f22] text-[#A977BF] border border-[#462C55] hover:border-[#704786]'
              }`}
            >
              {s || 'All'}
            </a>
          ))}
        </div>
      </div>

      {cases.length === 0 ? (
        <div className="text-[#704786] text-center py-16">No cases found.</div>
      ) : (
        <div className="bg-[#1a0f22] border border-[#462C55] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#462C55]">
                {['Case ID', 'Status', 'Priority', 'Alert Type', 'Severity', 'Recommendation', 'Created'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[#704786] font-medium text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((c, i) => {
                const rec = c.recommendations[0]
                return (
                  <tr
                    key={c.caseId}
                    className={`border-b border-[#2d1440] hover:bg-[#2d1440] transition-colors ${
                      i % 2 === 0 ? '' : 'bg-[#150c1e]'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/cases/${c.caseId}`} className="text-[#A977BF] hover:text-[#E3C4E9] font-mono text-xs">
                        {c.caseId.slice(0, 24)}…
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="px-4 py-3 text-[#A977BF]">{c.alert?.alertType ?? '—'}</td>
                    <td className="px-4 py-3 text-[#A977BF]">{c.alert?.severity ?? '—'}</td>
                    <td className="px-4 py-3">
                      {rec ? (
                        <span
                          className={`text-xs font-medium ${
                            rec.recommendedAction === 'clear'
                              ? 'text-green-400'
                              : rec.recommendedAction === 'escalate'
                                ? 'text-red-400'
                                : 'text-yellow-400'
                          }`}
                        >
                          {rec.recommendedAction}
                        </span>
                      ) : (
                        <span className="text-[#462C55] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#704786] text-xs">
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
