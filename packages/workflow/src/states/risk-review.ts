import type { RiskReviewState, RiskReviewEvent } from '@mistsplitter/core'
import { InvalidStateTransitionError } from '@mistsplitter/core'

/**
 * State machine for the risk_review workflow.
 * Plain transition table — no library required.
 *
 * Transitions: (currentState, event) → nextState
 * Missing entry = invalid transition → throws InvalidStateTransitionError
 */
export const TRANSITIONS: Record<
  RiskReviewState,
  Partial<Record<RiskReviewEvent, RiskReviewState>>
> = {
  pending: {
    intake_started: 'intake',
  },
  intake: {
    intake_complete: 'retrieving',
    intake_failed: 'failed',
  },
  retrieving: {
    retrieval_complete: 'computing_signals',
    retrieval_failed: 'failed',
  },
  computing_signals: {
    signals_computed: 'assembling_evidence',
    signals_failed: 'failed',
  },
  assembling_evidence: {
    evidence_assembled: 'generating_summary',
    assembly_failed: 'failed',
  },
  generating_summary: {
    summary_generated: 'awaiting_policy',
    summary_failed: 'failed',
  },
  awaiting_policy: {
    policy_permitted: 'awaiting_review',
    policy_blocked: 'failed',
  },
  awaiting_review: {
    review_submitted: 'closed',
  },
  closed: {
    // Terminal state — no transitions out
  },
  failed: {
    workflow_retried: 'pending',
  },
}

/**
 * Compute the next state from the current state + event.
 * Throws InvalidStateTransitionError for invalid transitions.
 */
export function transition(
  currentState: RiskReviewState,
  event: RiskReviewEvent,
): RiskReviewState {
  const stateTransitions = TRANSITIONS[currentState]
  const nextState = stateTransitions[event]

  if (nextState === undefined) {
    throw new InvalidStateTransitionError(currentState, event)
  }

  return nextState
}

/**
 * Check if the given state is a terminal state.
 */
export function isTerminalState(state: RiskReviewState): boolean {
  return state === 'closed' || state === 'failed'
}

/**
 * Check if the given state requires human action to proceed.
 */
export function requiresHumanAction(state: RiskReviewState): boolean {
  return state === 'awaiting_review'
}
