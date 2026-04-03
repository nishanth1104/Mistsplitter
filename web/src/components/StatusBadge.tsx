import type { CaseStatus } from '@/lib/types'

const STATUS_STYLES: Record<CaseStatus, string> = {
  pending:          'bg-gray-700 text-gray-200 ring-gray-500',
  in_review:        'bg-blue-900 text-blue-200 ring-blue-500',
  escalated:        'bg-orange-900 text-orange-200 ring-orange-500',
  closed_clear:     'bg-green-900 text-green-200 ring-green-500',
  closed_actioned:  'bg-red-900 text-red-200 ring-red-500',
}

const STATUS_LABELS: Record<CaseStatus, string> = {
  pending:         'Pending',
  in_review:       'In Review',
  escalated:       'Escalated',
  closed_clear:    'Closed · Clear',
  closed_actioned: 'Closed · Actioned',
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  const cls = STATUS_STYLES[status] ?? 'bg-gray-700 text-gray-200 ring-gray-500'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${cls}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
