import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import type { AuditLogResponse } from '@/lib/types'

function actionColor(action: string): string {
  if (action.startsWith('agent.'))    return 'text-purple-400'
  if (action.startsWith('workflow.')) return 'text-blue-400'
  if (action.startsWith('review.'))   return 'text-emerald-400'
  if (action.startsWith('policy.'))   return 'text-orange-400'
  if (action.startsWith('case.'))     return 'text-yellow-400'
  if (action.startsWith('tool.'))     return 'text-pink-400'
  if (action.startsWith('summary.'))  return 'text-cyan-400'
  return 'text-muted-foreground'
}

const LEGEND = [
  ['agent.*',    'text-purple-400'],
  ['workflow.*', 'text-blue-400'],
  ['review.*',   'text-emerald-400'],
  ['policy.*',   'text-orange-400'],
  ['case.*',     'text-yellow-400'],
  ['tool.*',     'text-pink-400'],
  ['summary.*',  'text-cyan-400'],
] as const

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
        <h1 className="text-2xl font-bold text-foreground">Audit Explorer</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {data.total} events total — showing latest {data.logs.length}
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-6">
        {LEGEND.map(([label, cls]) => (
          <span
            key={label}
            className={`${cls} text-xs font-mono bg-card border border-border px-2 py-1 rounded`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Time', 'Actor', 'Role', 'Action', 'Case ID', 'Payload'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.logs.map((log) => (
              <tr
                key={log.logId}
                className="border-b border-border/50 hover:bg-accent/50 transition-colors"
              >
                <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-foreground text-xs">{log.actorId}</td>
                <td className="px-4 py-2.5 text-muted-foreground/60 text-xs">{log.actorRole}</td>
                <td className={`px-4 py-2.5 text-xs font-medium font-mono ${actionColor(log.action)}`}>
                  {log.action}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {log.caseId ? (
                    <Link href={`/cases/${log.caseId}`} className="text-cyan-400 hover:text-cyan-300 font-mono transition-colors">
                      {log.caseId.slice(0, 16)}…
                    </Link>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground/60 text-xs font-mono max-w-xs">
                  <details>
                    <summary className="cursor-pointer hover:text-foreground truncate max-w-xs transition-colors">
                      {JSON.stringify(log.payloadJson).slice(0, 80)}
                      {JSON.stringify(log.payloadJson).length > 80 ? '…' : ''}
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all text-muted-foreground bg-background rounded p-2 text-xs max-w-md overflow-auto max-h-48 border border-border">
                      {JSON.stringify(log.payloadJson, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
