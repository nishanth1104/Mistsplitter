'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEV_AUTH } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

type ReviewAction = 'approved' | 'overridden' | 'escalated'

export function ReviewForm({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [action, setAction]                     = useState<ReviewAction>('approved')
  const [reasonCode, setReasonCode]             = useState('')
  const [notes, setNotes]                       = useState('')
  const [submitting, setSubmitting]             = useState(false)
  const [error, setError]                       = useState<string | null>(null)
  const [success, setSuccess]                   = useState(false)
  const [escalationConfirmed, setEscalationConfirmed] = useState(false)

  const needsReasonCode       = action === 'overridden'
  const needsEscalationConfirm = action === 'escalated' && !escalationConfirmed
  const canSubmit             = !submitting && (!needsReasonCode || reasonCode.trim().length > 0) && !needsEscalationConfirm

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/cases/${caseId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: DEV_AUTH },
        body: JSON.stringify({
          finalAction: action,
          overrideFlag: action === 'overridden',
          ...(reasonCode.trim() ? { reasonCode: reasonCode.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setError(body.error ?? `Error ${res.status}`)
        return
      }
      setSuccess(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-lg p-4 text-emerald-400 text-sm">
        Review submitted successfully. Page will refresh automatically.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Action selector */}
      <div>
        <label className="block text-muted-foreground text-xs font-medium mb-2 uppercase tracking-wide">
          Review Action
        </label>
        <div className="flex gap-2">
          {(['approved', 'overridden', 'escalated'] as ReviewAction[]).map((a) => (
            <Button
              key={a}
              type="button"
              variant={action === a ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setAction(a); setError(null); setEscalationConfirmed(false) }}
              className={action === a ? (
                a === 'approved'  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-0' :
                a === 'escalated' ? 'bg-orange-600  hover:bg-orange-700  text-white border-0' :
                                    'bg-rose-700    hover:bg-rose-800    text-white border-0'
              ) : ''}
            >
              {a.charAt(0).toUpperCase() + a.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Reason code */}
      {needsReasonCode && (
        <div>
          <label className="block text-muted-foreground text-xs font-medium mb-2 uppercase tracking-wide">
            Reason Code <span className="text-rose-400">*</span>
          </label>
          <Input
            type="text"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            placeholder="e.g. KNOWN_CUSTOMER_PATTERN"
            className="font-mono"
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-muted-foreground text-xs font-medium mb-2 uppercase tracking-wide">
          Notes (optional)
        </label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Additional context or rationale..."
          className="resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/40 rounded px-3 py-2 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={!canSubmit}
        className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-semibold disabled:opacity-40"
      >
        {submitting ? 'Submitting…' : 'Submit Review'}
      </Button>

      {needsReasonCode && !reasonCode.trim() && (
        <p className="text-rose-400 text-xs">Reason code is required for override.</p>
      )}

      {/* Escalation confirm */}
      {action === 'escalated' && !escalationConfirmed && (
        <div className="bg-orange-500/10 border border-orange-500/40 rounded-lg p-3">
          <p className="text-orange-300 text-xs mb-2">
            Escalation triggers a senior review and may have regulatory implications. Confirm to proceed.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => setEscalationConfirmed(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white border-0"
          >
            Confirm Escalation
          </Button>
        </div>
      )}
    </form>
  )
}
