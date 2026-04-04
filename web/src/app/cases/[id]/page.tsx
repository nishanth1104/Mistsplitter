import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import type { CaseDetail, AuditLogResponse } from '@/lib/types'
import { StatusBadge } from '@/components/StatusBadge'
import { PriorityBadge } from '@/components/PriorityBadge'
import { ReviewForm } from './ReviewForm'

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-5 mb-4">
      <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-widest mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground text-xs w-40 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-foreground text-sm flex-1">{value ?? <span className="text-muted-foreground/40">—</span>}</span>
    </div>
  )
}

function actionColor(action: string): string {
  if (action.startsWith('agent.'))    return 'text-purple-400'
  if (action.startsWith('workflow.')) return 'text-blue-400'
  if (action.startsWith('review.'))   return 'text-emerald-400'
  if (action.startsWith('policy.'))   return 'text-orange-400'
  if (action.startsWith('summary.'))  return 'text-cyan-400'
  return 'text-muted-foreground'
}

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const [caseData, auditData] = await Promise.all([
    apiFetch<CaseDetail>(`/cases/${params.id}`).catch(() => null),
    apiFetch<AuditLogResponse>(`/audit-logs?caseId=${params.id}&limit=50`).catch(() => ({
      logs: [], total: 0, limit: 50, offset: 0,
    })),
  ])

  if (!caseData) notFound()

  const c   = caseData.case
  const rec = c.recommendations[0]
  const rev = c.reviews[0]
  const run = c.workflowRuns[0]
  const txn = c.alert?.transaction

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <a href="/cases" className="text-muted-foreground text-xs hover:text-cyan-400 mb-2 inline-block transition-colors">
            ← Cases
          </a>
          <h1 className="text-xl font-bold text-foreground font-mono">{c.caseId}</h1>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={c.status} />
          <PriorityBadge priority={c.priority} />
        </div>
      </div>

      <Panel title="Case">
        <Field label="Case ID"        value={<span className="font-mono text-xs">{c.caseId}</span>} />
        <Field label="Correlation ID" value={<span className="font-mono text-xs">{c.correlationId}</span>} />
        <Field label="Assigned To"    value={c.assignedTo} />
        <Field label="Created"        value={new Date(c.createdAt).toLocaleString()} />
        <Field label="Updated"        value={new Date(c.updatedAt).toLocaleString()} />
      </Panel>

      <Panel title="Alert">
        <Field label="Alert ID"   value={<span className="font-mono text-xs">{c.alert.alertId}</span>} />
        <Field label="Type"       value={c.alert.alertType} />
        <Field label="Severity"   value={c.alert.severity} />
        {txn && (
          <>
            <Field label="Amount"     value={<span className="font-mono">{txn.amount} {txn.currency}</span>} />
            <Field label="Channel"    value={txn.channel} />
            <Field label="Txn Status" value={txn.status} />
            <Field label="Timestamp"  value={new Date(txn.timestamp).toLocaleString()} />
          </>
        )}
      </Panel>

      <Panel title="Workflow">
        {run ? (
          <>
            <Field label="Run ID"  value={<span className="font-mono text-xs">{run.runId}</span>} />
            <Field label="State"   value={<span className="text-cyan-400 font-medium font-mono">{run.state}</span>} />
            <Field label="Status"  value={run.status} />
            <Field label="Started" value={new Date(run.startedAt).toLocaleString()} />
            {run.endedAt && <Field label="Ended" value={new Date(run.endedAt).toLocaleString()} />}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">No workflow run yet.</p>
        )}
      </Panel>

      {/* ── Recommendation — hero panel ── */}
      <div className="bg-card border-2 border-cyan-500/40 rounded-lg p-5 mb-4 shadow-[0_0_24px_0_rgba(6,182,212,0.07)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-cyan-400 text-xs font-semibold uppercase tracking-widest">Recommendation</h2>
          {rec && (
            <span className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded border ${
              rec.recommendedAction === 'clear'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : rec.recommendedAction === 'escalate'
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
            }`}>
              {rec.recommendedAction}
            </span>
          )}
        </div>
        {rec ? (
          <>
            <Field label="Confidence" value={<span className="font-mono">{rec.confidence}</span>} />
            <Field label="Generated"  value={new Date(rec.createdAt).toLocaleString()} />
            <div className="mt-4 p-4 bg-background rounded-lg border border-border">
              <div className="text-muted-foreground text-xs mb-2 uppercase tracking-wide font-medium">AI Summary</div>
              <p className="text-foreground text-sm leading-relaxed">{rec.summary}</p>
            </div>
            {rec.evidenceReferences.length > 0 && (
              <div className="mt-3">
                <div className="text-muted-foreground text-xs mb-2 uppercase tracking-wide font-medium">Evidence</div>
                <div className="flex flex-wrap gap-2">
                  {rec.evidenceReferences.map((r) => (
                    <span key={r} className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 text-xs rounded border border-cyan-500/30 font-mono">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">No recommendation yet. Run the workflow first.</p>
        )}
      </div>

      <Panel title="Latest Review">
        {rev ? (
          <>
            <Field label="Reviewer"    value={rev.reviewerId} />
            <Field label="Action"      value={<span className="font-medium">{rev.finalAction}</span>} />
            <Field label="Override"    value={rev.overrideFlag ? 'Yes' : 'No'} />
            <Field label="Reason Code" value={rev.reasonCode} />
            <Field label="Notes"       value={rev.notes} />
            <Field label="Reviewed At" value={new Date(rev.reviewedAt).toLocaleString()} />
          </>
        ) : (
          <p className="text-muted-foreground text-sm">No review submitted yet.</p>
        )}
      </Panel>

      <Panel title={`Audit Trail (${auditData.total} events)`}>
        {auditData.logs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No audit events.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {['Time', 'Actor', 'Role', 'Action'].map((h) => (
                    <th key={h} className="text-left px-2 py-2 text-muted-foreground font-medium uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...auditData.logs].reverse().map((log) => (
                  <tr key={log.logId} className="border-b border-border/40 hover:bg-accent/30">
                    <td className="px-2 py-2 text-muted-foreground font-mono whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-2 py-2 text-foreground">{log.actorId}</td>
                    <td className="px-2 py-2 text-muted-foreground/60">{log.actorRole}</td>
                    <td className={`px-2 py-2 font-mono ${actionColor(log.action)}`}>{log.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {!['closed_clear', 'closed_actioned'].includes(c.status) && (
        <Panel title="Submit Review">
          <ReviewForm caseId={c.caseId} />
        </Panel>
      )}
    </div>
  )
}
