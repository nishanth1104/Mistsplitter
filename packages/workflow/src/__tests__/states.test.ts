import { describe, it, expect } from 'vitest'
import { transition, isTerminalState, requiresHumanAction, TRANSITIONS } from '../states/risk-review.js'
import { InvalidStateTransitionError } from '@mistsplitter/core'

describe('risk_review state machine', () => {
  describe('transition()', () => {
    it('transitions from pending on intake_started', () => {
      expect(transition('pending', 'intake_started')).toBe('intake')
    })

    it('transitions from intake on intake_complete', () => {
      expect(transition('intake', 'intake_complete')).toBe('retrieving')
    })

    it('transitions from intake to failed on intake_failed', () => {
      expect(transition('intake', 'intake_failed')).toBe('failed')
    })

    it('transitions from retrieving on retrieval_complete', () => {
      expect(transition('retrieving', 'retrieval_complete')).toBe('computing_signals')
    })

    it('transitions from computing_signals on signals_computed', () => {
      expect(transition('computing_signals', 'signals_computed')).toBe('assembling_evidence')
    })

    it('transitions from assembling_evidence on evidence_assembled', () => {
      expect(transition('assembling_evidence', 'evidence_assembled')).toBe('generating_summary')
    })

    it('transitions from generating_summary on summary_generated', () => {
      expect(transition('generating_summary', 'summary_generated')).toBe('awaiting_policy')
    })

    it('transitions from awaiting_policy on policy_permitted', () => {
      expect(transition('awaiting_policy', 'policy_permitted')).toBe('awaiting_review')
    })

    it('transitions from awaiting_policy to failed on policy_blocked', () => {
      expect(transition('awaiting_policy', 'policy_blocked')).toBe('failed')
    })

    it('transitions from awaiting_review on review_submitted', () => {
      expect(transition('awaiting_review', 'review_submitted')).toBe('closed')
    })

    it('transitions from failed on workflow_retried', () => {
      expect(transition('failed', 'workflow_retried')).toBe('pending')
    })

    it('all fail events go to failed state', () => {
      expect(transition('retrieving', 'retrieval_failed')).toBe('failed')
      expect(transition('computing_signals', 'signals_failed')).toBe('failed')
      expect(transition('assembling_evidence', 'assembly_failed')).toBe('failed')
      expect(transition('generating_summary', 'summary_failed')).toBe('failed')
    })
  })

  describe('invalid transitions', () => {
    it('throws InvalidStateTransitionError for invalid event', () => {
      expect(() => transition('pending', 'review_submitted')).toThrow(InvalidStateTransitionError)
    })

    it('throws for any event on closed state', () => {
      expect(() => transition('closed', 'intake_started')).toThrow(InvalidStateTransitionError)
    })

    it('throws for non-applicable event on intake', () => {
      expect(() => transition('intake', 'review_submitted')).toThrow(InvalidStateTransitionError)
    })

    it('throws for non-applicable event on awaiting_review', () => {
      expect(() => transition('awaiting_review', 'intake_started')).toThrow(InvalidStateTransitionError)
    })

    it('throws error with descriptive message', () => {
      expect(() => transition('pending', 'review_submitted')).toThrow(
        'Invalid state transition: pending + review_submitted',
      )
    })
  })

  describe('isTerminalState()', () => {
    it('returns true for closed', () => {
      expect(isTerminalState('closed')).toBe(true)
    })
    it('returns true for failed', () => {
      expect(isTerminalState('failed')).toBe(true)
    })
    it('returns false for all non-terminal states', () => {
      const nonTerminal: Array<Parameters<typeof isTerminalState>[0]> = [
        'pending', 'intake', 'retrieving', 'computing_signals',
        'assembling_evidence', 'generating_summary', 'awaiting_policy', 'awaiting_review',
      ]
      for (const state of nonTerminal) {
        expect(isTerminalState(state)).toBe(false)
      }
    })
  })

  describe('requiresHumanAction()', () => {
    it('returns true for awaiting_review', () => {
      expect(requiresHumanAction('awaiting_review')).toBe(true)
    })
    it('returns false for all other states', () => {
      const states: Array<Parameters<typeof requiresHumanAction>[0]> = [
        'pending', 'intake', 'retrieving', 'computing_signals',
        'assembling_evidence', 'generating_summary', 'awaiting_policy',
        'closed', 'failed',
      ]
      for (const state of states) {
        expect(requiresHumanAction(state)).toBe(false)
      }
    })
  })

  describe('TRANSITIONS table completeness', () => {
    it('has entries for all valid states', () => {
      const expectedStates = [
        'pending', 'intake', 'retrieving', 'computing_signals',
        'assembling_evidence', 'generating_summary', 'awaiting_policy',
        'awaiting_review', 'closed', 'failed',
      ]
      for (const state of expectedStates) {
        expect(TRANSITIONS).toHaveProperty(state)
      }
    })
  })
})
