import type { CasePriority } from '@/lib/types'

const PRIORITY_STYLES: Record<CasePriority, string> = {
  critical: 'bg-red-900 text-red-200 ring-red-500',
  high:     'bg-orange-900 text-orange-200 ring-orange-500',
  medium:   'bg-yellow-900 text-yellow-200 ring-yellow-600',
  low:      'bg-gray-700 text-gray-300 ring-gray-500',
}

export function PriorityBadge({ priority }: { priority: CasePriority }) {
  const cls = PRIORITY_STYLES[priority] ?? 'bg-gray-700 text-gray-300 ring-gray-500'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset uppercase tracking-wide ${cls}`}>
      {priority}
    </span>
  )
}
