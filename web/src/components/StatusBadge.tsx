import { Badge } from '@/components/ui/badge'
import type { CaseStatus } from '@/lib/types'

const STATUS_CONFIG: Record<CaseStatus, { label: string; className: string }> = {
  pending:         { label: 'Pending',          className: 'bg-slate-500/20 text-slate-300 border-slate-500/40 hover:bg-slate-500/20' },
  in_review:       { label: 'In Review',        className: 'bg-blue-500/20  text-blue-300  border-blue-500/40  hover:bg-blue-500/20'  },
  escalated:       { label: 'Escalated',        className: 'bg-orange-500/20 text-orange-300 border-orange-500/40 hover:bg-orange-500/20' },
  closed_clear:    { label: 'Closed · Clear',   className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20' },
  closed_actioned: { label: 'Closed · Actioned',className: 'bg-rose-500/20  text-rose-300   border-rose-500/40  hover:bg-rose-500/20'  },
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  const { label, className } = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  )
}
