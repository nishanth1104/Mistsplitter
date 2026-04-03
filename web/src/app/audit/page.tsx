import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import type { AuditLogResponse } from '@/lib/types'

function actionColor(action: string): string {
  if (action.startsWith('agent.')) return 'text-purple-400'
  if (action.startsWith('workflow.')) return 'text-blue-400'
  if (action.startsWith('review.')) return 'text-green-400'
  if (action.startsWith('policy.')) return 'text-orange-400'
  if (action.startsWith('case.')) return 'text-yellow-400'
  if (action.startsWith('tool.')) return 'text-pink-400'
  if (action.startsWith('summary.')) return 'text-cyan-400'
  return 'text-[#A977BF]'
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { caseId?: string; action?: string }
}) {
  const params = new URLSearchParams({ limit: '100' })
  if (searchParams.caseId) params.set('caseId', searchParams.caseId)
  if (searchParams.action) params.set('action', searchParams.action)

  const data = await apiFetch<AuditLogResponse>(`/audit-logs?${params.toString()}`).catch(() => ({
    logs: [],
    total: 0,
    limit: 100,
    offset: 0,
  }))

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#E3C4E9]">Audit Explorer</h1>
        <p className="text-[#704786] text-sm mt-1">
          {data.total} events total — showing latest {data.logs.length}
        </p>
      </div>

      {/* Color legend */}
      <div className="flex flex-wrap gap-4 mb-6 text-xs">
        {[
          ['agent.*', 'text-purple-400'],
          ['workflow.*', 'text-blue-400'],
          ['review.*', 'text-green-400'],
          ['policy.*', 'text-orange-400'],
          ['case.*', 'text-yellow-400'],
          ['tool.*', 'text-pink-400'],
          ['summary.*', 'text-cyan-400'],
        ].map(([label, cls]) => (
          <span key={label} className={`${cls}`}>{label}</span>
        ))}
      </div>

      <div className="bg-[#1a0f22] border border-[#462C55] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#462C55]">
              {['Time', 'Actor', 'Role', 'Action', 'Case ID', 'Payload'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[#704786] font-medium text-xs uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.logs.map((log, i) => (
              <tr
                key={log.logId}
                className={`border-b border-[#2d1440] hover:bg-[#2d1440] transition-colors ${
                  i % 2 === 0 ? '' : 'bg-[#150c1e]'
                }`}
              >
                <td className="px-4 py-2.5 text-[#704786] font-mono text-xs whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-[#A977BF] text-xs">{log.actorId}</td>
                <td className="px-4 py-2.5 text-[#462C55] text-xs">{log.actorRole}</td>
                <td className={`px-4 py-2.5 text-xs font-medium ${actionColor(log.action)}`}>
                  {log.action}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {log.caseId ? (
                    <Link href={`/cases/${log.caseId}`} className="text-[#704786] hover:text-[#A977BF] font-mono">
                      {log.caseId.slice(0, 16)}…
                    </Link>
                  ) : (
                    <span className="text-[#462C55]">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[#462C55] text-xs font-mono max-w-xs truncate">
                  {JSON.stringify(log.payloadJson).slice(0, 80)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
