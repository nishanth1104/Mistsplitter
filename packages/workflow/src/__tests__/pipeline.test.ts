import { describe, it, expect, vi } from 'vitest'

vi.mock('@mistsplitter/agents', () => ({
  runIntakeAgent: vi.fn(),
  runRetrievalAgent: vi.fn(),
  runSignalAgent: vi.fn(),
  runEvidenceAgent: vi.fn(),
  runSummaryAgent: vi.fn(),
  runPolicyAgent: vi.fn(),
}))

import { RISK_REVIEW_STEPS, buildExecutors } from '../pipeline.js'

const EXPECTED_STEP_NAMES = [
  'intake', 'retrieval', 'signal', 'evidence', 'summary', 'policy', 'policy_gate',
]

describe('RISK_REVIEW_STEPS', () => {
  it('defines 7 steps in correct order', () => {
    expect(RISK_REVIEW_STEPS).toHaveLength(7)
    expect(RISK_REVIEW_STEPS.map((s) => s.name)).toEqual(EXPECTED_STEP_NAMES)
  })

  it('intake step fires intake_started event', () => {
    const intake = RISK_REVIEW_STEPS.find((s) => s.name === 'intake')
    expect(intake?.event).toBe('intake_started')
  })

  it('policy_gate step fires policy_permitted event', () => {
    const gate = RISK_REVIEW_STEPS.find((s) => s.name === 'policy_gate')
    expect(gate?.event).toBe('policy_permitted')
  })

  it('all steps have a non-empty agentName', () => {
    for (const step of RISK_REVIEW_STEPS) {
      expect(step.agentName).toBeTruthy()
    }
  })

  it('summary step has maxRetries >= 1 for resilience', () => {
    const summary = RISK_REVIEW_STEPS.find((s) => s.name === 'summary')
    expect(summary?.maxRetries).toBeGreaterThanOrEqual(1)
  })
})

describe('buildExecutors', () => {
  it('returns a map with all 7 executors', () => {
    const executors = buildExecutors('case_1', 'run_1')
    expect(executors.size).toBe(7)
    for (const name of EXPECTED_STEP_NAMES) {
      expect(executors.has(name)).toBe(true)
    }
  })

  it('each executor is a function', () => {
    const executors = buildExecutors('case_1', 'run_1')
    for (const [, fn] of executors) {
      expect(typeof fn).toBe('function')
    }
  })

  it('policy_gate executor returns success without calling an agent', async () => {
    const executors = buildExecutors('case_1', 'run_1')
    const gateExecutor = executors.get('policy_gate')
    expect(gateExecutor).toBeDefined()
    const result = await gateExecutor!()
    expect(result.success).toBe(true)
    expect((result.data as { gate: string }).gate).toBe('policy_permitted')
  })

  it('intake executor calls runIntakeAgent with correct params', async () => {
    const { runIntakeAgent } = await import('@mistsplitter/agents')
    ;(runIntakeAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })
    const executors = buildExecutors('case_42', 'run_99')
    const intakeExecutor = executors.get('intake')
    await intakeExecutor!()
    expect(runIntakeAgent).toHaveBeenCalledWith('case_42', 'run_99')
  })
})
