import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import type { CaseDetail, AuditLogResponse } from '@/lib/types'
import { StatusBadge } from '@/components/StatusBadge'
import { PriorityBadge } from '@/components/PriorityBadge'
import { ReviewForm } from './ReviewForm'

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a0f22] border border-[#462C55] rounded-lg p-5 mb-4">
      <h2 className="text-[#704786] text-xs font-semibold uppercase tracking-widest mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-1.5 border-b border-[#2d1440] last:border-0">
      <span className="text-[#704786] text-xs w-40 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-[#E3C4E9] text-sm flex-1">{value ?? <span className="text-[#462C55]">—</span>}</span>
    </div>
  )
}

function ActionColor({ action }: { action: string }) {
  const cls =
    action === 'clear' ? 'text-green-400'
    : action === 'escalate' ? 'text-red-400'
    : 'text-yellow-400'
  return <span className={`font-semibold ${cls}`}>{action}</span>
}

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const [caseData, auditData] = await Promise.all([
    apiFetch<CaseDetail>(`/cases/${params.id}`).catch(() => null),
    apiFetch<AuditLogResponse>(`/audit-logs?caseId=${params.id}&limit=50`).catch(() => ({ logs: [], total: 0, limit: 50, offset: 0 })),
  ])

  if (!caseData) notFound()

  const c = caseData.case
  const rec = c.recommendations[0]
  const rev = c.reviews[0]
  const run = c.workflowRuns[0]
  const txn = c.alert?.transaction

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <a href="/cases" className="text-[#704786] text-xs hover:text-[#A977BF] mb-2 inline-block">
            ← Cases
          </a>
          <h1 className="text-xl font-bold text-[#E3C4E9] font-mono">{c.caseId}</h1>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={c.status} />
          <PriorityBadge priority={c.priority} />
        </div>
      </div>

      {/* Case Info */}
      <Panel title="Case">
        <Field label="Case ID" value={<span className="font-mono text-xs">{c.caseId}</span>} />
        <Field label="Correlation ID" value={<span className="font-mono text-xs">{c.correlationId}</span>} />
        <Field label="Assigned To" value={c.assignedTo} />
        <Field label="Created" value={new Date(c.createdAt).toLocaleString()} />
        <Field label="Updated" value={new Date(c.updatedAt).toLocaleString()} />
      </Panel>

      {/* Alert */}
      <Panel title="Alert">
        <Field label="Alert ID" value={<span className="font-mono text-xs">{c.alert.alertId}</span>} />
        <Field label="Type" value={c.alert.alertType} />
        <Field label="Severity" value={c.alert.severity} />
        {txn && (
          <>
            <Field label="Amount" value={`${txn.amount} ${txn.currency}`} />
            <Field label="Channel" value={txn.channel} />
            <Field label="Txn Status" value={txn.status} />
            <Field label="Timestamp" value={new Date(txn.timestamp).toLocaleString()} />
          </>
        )}
      </Panel>

      {/* Workflow */}
      <Panel title="Workflow">
        {run ? (
          <>
            <Field label="Run ID" value={<span className="font-mono text-xs">{run.runId}</span>} />
            <Field label="State" value={<span className="text-[#A977BF] font-medium">{run.state}</span>} />
            <Field label="Status" value={run.status} />
            <Field label="Started" value={new Date(run.startedAt).toLocaleString()} />
            {run.endedAt && <Field label="Ended" value={new Date(run.endedAt).toLocaleString()} />}
          </>
        ) : (
          <p className="text-[#462C55] text-sm">No workflow run yet.</p>
        )}
      </Panel>

      {/* Recommendation */}
      <Panel title="Recommendation">
        {rec ? (
          <>
            <Field label="Action" value={<ActionColor action={rec.recommendedAction} />} />
            <Field label="Confidence" value={rec.confidence} />
            <Field label="Generated" value={new Date(rec.createdAt).toLocaleString()} />
            <div className="mt-3 p-3 bg-[#110918] rounded border border-[#2d1440]">
              <div className="text-[#704786] text-xs mb-1 uppercase tracking-wide">Summary</div>
              <p className="text-[#E3C4E9] text-sm leading-relaxed">{rec.summary}</p>
            </div>
            {rec.evidenceReferences.length > 0 && (
              <div className="mt-3">
                <div className="text-[#704786] text-xs mb-1 uppercase tracking-wide">Evidence References</div>
                <div className="flex flex-wrap gap-2">
                  {rec.evidenceReferences.map((r) => (
                    <span key={r} className="px-2 py-0.5 bg-[#2d1440] text-[#A977BF] text-xs rounded">{r}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-[#462C55] text-sm">No recommendation yet. Run the workflow first.</p>
        )}
      </Panel>

      {/* Review */}
      <Panel title="Latest Review">
        {rev ? (
          <>
            <Field label="Reviewer" value={rev.reviewerId} />
            <Field label="Action" value={<span className="font-medium">{rev.finalAction}</span>} />
            <Field label="Override" value={rev.overrideFlag ? 'Yes' : 'No'} />
            <Field label="Reason Code" value={rev.reasonCode} />
            <Field label="Notes" value={rev.notes} />
            <Field label="Reviewed At" value={new Date(rev.reviewedAt).toLocaleString()} />
          </>
        ) : (
          <p className="text-[#462C55] text-sm">No review submitted yet.</p>
        )}
      </Panel>

      {/* Audit Trail */}
      <Panel title={`Audit Trail (${auditData.total} events)`}>
        {auditData.logs.length === 0 ? (
          <p className="text-[#462C55] text-sm">No audit events.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2d1440]">
                  {['Time', 'Actor', 'Role', 'Action'].map((h) => (
                    <th key={h} className="text-left px-2 py-2 text-[#704786] font-medium uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...auditData.logs].reverse().map((log) => (
                  <tr key={log.logId} className="border-b border-[#1a0f22] hover:bg-[#1a0f22]">
                    <td className="px-2 py-2 text-[#704786] font-mono whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-2 py-2 text-[#A977BF]">{log.actorId}</td>
                    <td className="px-2 py-2 text-[#462C55]">{log.actorRole}</td>
                    <td className="px-2 py-2 text-[#E3C4E9]">{log.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Review Form */}
      {!['closed_clear', 'closed_actioned'].includes(c.status) && (
        <Panel title="Submit Review">
          <ReviewForm caseId={c.caseId} />
        </Panel>
      )}
    </div>
  )
}
