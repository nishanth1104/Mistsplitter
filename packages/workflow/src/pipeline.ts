/**
 * Risk Review Pipeline — step definitions and executor factory.
 *
 * RISK_REVIEW_STEPS defines the ordered sequence of state machine steps.
 * Each step's `event` is the transition event that fires at the START of that step,
 * moving the workflow into the active processing state before the executor runs.
 *
 * State transitions per step:
 *   intake:        pending → intake             (event: intake_started)
 *   retrieval:     intake  → retrieving          (event: intake_complete)
 *   signal:        retrieving → computing_signals (event: retrieval_complete)
 *   evidence:      computing_signals → assembling_evidence (event: signals_computed)
 *   summary:       assembling_evidence → generating_summary (event: evidence_assembled)
 *   policy:        generating_summary → awaiting_policy (event: summary_generated)
 *   policy_gate:   awaiting_policy → awaiting_review (event: policy_permitted)
 *
 * After policy_gate, requiresHumanAction('awaiting_review') === true → workflow pauses for human review.
 */

import {
  runIntakeAgent,
  runRetrievalAgent,
  runSignalAgent,
  runEvidenceAgent,
  runSummaryAgent,
  runPolicyAgent,
} from '@mistsplitter/agents'
import type { WorkflowStep, StepResult } from './types.js'
import type { StepExecutorMap } from './runtime.js'

export const RISK_REVIEW_STEPS: WorkflowStep[] = [
  { name: 'intake',       event: 'intake_started',     agentName: 'IntakeAgent',     maxRetries: 1 },
  { name: 'retrieval',    event: 'intake_complete',    agentName: 'RetrievalAgent',  maxRetries: 2 },
  { name: 'signal',       event: 'retrieval_complete', agentName: 'SignalAgent',      maxRetries: 1 },
  { name: 'evidence',     event: 'signals_computed',   agentName: 'EvidenceAgent',   maxRetries: 1 },
  { name: 'summary',      event: 'evidence_assembled', agentName: 'SummaryAgent',    maxRetries: 2 },
  { name: 'policy',       event: 'summary_generated',  agentName: 'PolicyAgent',     maxRetries: 1 },
  { name: 'policy_gate',  event: 'policy_permitted',   agentName: 'system',          maxRetries: 0 },
]

/**
 * Build the executor map for a specific workflow run.
 * Each executor is a closure that captures caseId and runId.
 */
export function buildExecutors(caseId: string, runId: string): StepExecutorMap {
  return new Map<string, () => Promise<StepResult>>([
    ['intake',      () => runIntakeAgent(caseId, runId)],
    ['retrieval',   () => runRetrievalAgent(caseId, runId)],
    ['signal',      () => runSignalAgent(caseId, runId)],
    ['evidence',    () => runEvidenceAgent(caseId, runId)],
    ['summary',     () => runSummaryAgent(caseId, runId)],
    ['policy',      () => runPolicyAgent(caseId, runId)],
    // policy_gate: fires policy_permitted event to transition awaiting_policy → awaiting_review
    // The policy decision was already evaluated by PolicyAgent; this is just a gate step.
    ['policy_gate', async (): Promise<StepResult> => ({ success: true, data: { gate: 'policy_permitted' } })],
  ])
}
