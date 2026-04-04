'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEV_AUTH } from '@/lib/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

type ReviewAction = 'approved' | 'overridden' | 'escalated'

export function ReviewForm({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [action, setAction] = useState<ReviewAction>('approved')
  const [reasonCode, setReasonCode] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const needsReasonCode = action === 'overridden'
  const [escalationConfirmed, setEscalationConfirmed] = useState(false)
  const needsEscalationConfirm = action === 'escalated' && !escalationConfirmed
  const canSubmit = !submitting && (!needsReasonCode || reasonCode.trim().length > 0) && !needsEscalationConfirm

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/cases/${caseId}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: DEV_AUTH,
        },
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
      <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-green-300 text-sm">
        Review submitted successfully. Page will refresh automatically.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Action selector */}
      <div>
        <label className="block text-[#A977BF] text-xs font-medium mb-2 uppercase tracking-wide">
          Review Action
        </label>
        <div className="flex gap-2">
          {(['approved', 'overridden', 'escalated'] as ReviewAction[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => { setAction(a); setError(null); setEscalationConfirmed(false) }}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                action === a
                  ? a === 'approved'
                    ? 'bg-green-700 text-white'
                    : a === 'escalated'
                      ? 'bg-orange-700 text-white'
                      : 'bg-red-800 text-white'
                  : 'bg-[#1a0f22] text-[#A977BF] border border-[#462C55] hover:border-[#704786]'
              }`}
            >
              {a.charAt(0).toUpperCase() + a.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Reason code (required for override) */}
      {needsReasonCode && (
        <div>
          <label className="block text-[#A977BF] text-xs font-medium mb-2 uppercase tracking-wide">
            Reason Code <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            placeholder="e.g. KNOWN_CUSTOMER_PATTERN"
            className="w-full bg-[#110918] border border-[#462C55] rounded px-3 py-2 text-[#E3C4E9] text-sm focus:outline-none focus:border-[#704786] placeholder-[#462C55]"
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-[#A977BF] text-xs font-medium mb-2 uppercase tracking-wide">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Additional context or rationale..."
          className="w-full bg-[#110918] border border-[#462C55] rounded px-3 py-2 text-[#E3C4E9] text-sm focus:outline-none focus:border-[#704786] placeholder-[#462C55] resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded px-3 py-2 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="px-6 py-2 bg-[#704786] hover:bg-[#8D5FA5] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
      >
        {submitting ? 'Submitting…' : 'Submit Review'}
      </button>

      {needsReasonCode && !reasonCode.trim() && (
        <p className="text-red-400 text-xs">Reason code is required for override.</p>
      )}

      {/* Escalation confirmation — destructive action warning */}
      {action === 'escalated' && !escalationConfirmed && (
        <div className="bg-orange-900/30 border border-orange-700 rounded p-3">
          <p className="text-orange-300 text-xs mb-2">
            Escalation triggers a senior review and may have regulatory implications. Confirm to proceed.
          </p>
          <button
            type="button"
            onClick={() => setEscalationConfirmed(true)}
            className="px-4 py-1.5 bg-orange-700 hover:bg-orange-600 text-white text-xs font-medium rounded transition-colors"
          >
            Confirm Escalation
          </button>
        </div>
      )}
    </form>
  )
}
