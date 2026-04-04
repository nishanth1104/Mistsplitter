import { Badge } from '@/components/ui/badge'
import type { CasePriority } from '@/lib/types'

const PRIORITY_CONFIG: Record<CasePriority, string> = {
  critical: 'bg-rose-500/20    text-rose-300    border-rose-500/40    hover:bg-rose-500/20    uppercase tracking-wide',
  high:     'bg-orange-500/20  text-orange-300  border-orange-500/40  hover:bg-orange-500/20  uppercase tracking-wide',
  medium:   'bg-amber-500/20   text-amber-300   border-amber-500/40   hover:bg-amber-500/20   uppercase tracking-wide',
  low:      'bg-slate-500/20   text-slate-300   border-slate-500/40   hover:bg-slate-500/20   uppercase tracking-wide',
}

export function PriorityBadge({ priority }: { priority: CasePriority }) {
  return (
    <Badge variant="outline" className={PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.low}>
      {priority}
    </Badge>
  )
}
