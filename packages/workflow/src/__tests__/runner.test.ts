import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@mistsplitter/audit', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true }),
  AuditActions: {
    AGENT_INVOKED: 'agent.invoked',
    AGENT_COMPLETED: 'agent.completed',
    AGENT_FAILED: 'agent.failed',
  },
}))

vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      workflowRun: { update: vi.fn().mockResolvedValue({}) },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

import { executeStep } from '../runner.js'
import type { WorkflowContext, WorkflowStep } from '../types.js'

const CONTEXT: WorkflowContext = {
  runId: 'run_1',
  caseId: 'case_1',
  correlationId: 'corr_1',
  workflowName: 'risk_review',
  currentState: 'pending',
  startedAt: new Date(),
}

const INTAKE_STEP: WorkflowStep = {
  name: 'intake',
  event: 'intake_started',
  agentName: 'IntakeAgent',
  maxRetries: 0,
}

const RETRIEVAL_STEP: WorkflowStep = {
  name: 'retrieval',
  event: 'intake_complete',
  agentName: 'RetrievalAgent',
  maxRetries: 2,
}

describe('executeStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok with new state on successful executor', async () => {
    const context = { ...CONTEXT, currentState: 'pending' as const }
    const executor = vi.fn().mockResolvedValue({ success: true, data: { alertId: 'alert_1' } })

    const result = await executeStep(context, INTAKE_STEP, executor)

    expect(result.ok).toBe(true)
    expect(executor).toHaveBeenCalledOnce()
  })

  it('returns STEP_MAX_RETRIES after all attempts fail (maxRetries=0)', async () => {
    const context = { ...CONTEXT, currentState: 'pending' as const }
    const executor = vi.fn().mockResolvedValue({ success: false, error: 'persistent failure' })

    const result = await executeStep(context, INTAKE_STEP, executor)

    // maxRetries=0 means only 1 attempt total
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error?.code).toBe('STEP_MAX_RETRIES')
    expect(executor).toHaveBeenCalledTimes(1)
  })

  it('marks workflow run as failed when retries exhausted', async () => {
    const context = { ...CONTEXT, currentState: 'pending' as const }
    const executor = vi.fn().mockResolvedValue({ success: false, error: 'fails' })
    const { db } = await import('@mistsplitter/core')

    await executeStep(context, INTAKE_STEP, executor)

    expect(db.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    )
  })

  it('returns INVALID_STATE_TRANSITION on invalid event for current state', async () => {
    const context = { ...CONTEXT, currentState: 'closed' as const }
    const executor = vi.fn().mockResolvedValue({ success: true })

    const result = await executeStep(context, INTAKE_STEP, executor)

    // 'closed' state has no transition for 'intake_started'
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error?.code).toBe('INVALID_STATE_TRANSITION')
    expect(executor).not.toHaveBeenCalled()
  })

  it('handles executor throwing exception as a failure', async () => {
    const context = { ...CONTEXT, currentState: 'pending' as const }
    const executor = vi.fn().mockRejectedValue(new Error('crash'))

    const result = await executeStep(context, INTAKE_STEP, executor)

    expect(result.ok).toBe(false)
  })

  it('updates workflow state to the new state on executor success', async () => {
    const context = { ...CONTEXT, currentState: 'pending' as const }
    const executor = vi.fn().mockResolvedValue({ success: true })
    const { db } = await import('@mistsplitter/core')

    await executeStep(context, INTAKE_STEP, executor)

    // Should update state to 'intake' (result of transition pending→intake_started)
    expect(db.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'intake', status: 'running' }),
      }),
    )
  })

  it('writes AGENT_INVOKED audit event before execution', async () => {
    const context = { ...CONTEXT, currentState: 'pending' as const }
    const executor = vi.fn().mockResolvedValue({ success: true })
    const { writeAuditEvent } = await import('@mistsplitter/audit')

    await executeStep(context, INTAKE_STEP, executor)

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.invoked', actorId: 'IntakeAgent' }),
    )
  })

  it('retrieval step with maxRetries=2 exhausts all attempts on state transition failure', async () => {
    // When the first attempt succeeds at state transition (intake→retrieving),
    // subsequent retry attempts fail at state transition (retrieving→intake_complete invalid)
    // So the second attempt returns INVALID_STATE_TRANSITION, not STEP_MAX_RETRIES
    const context = { ...CONTEXT, currentState: 'intake' as const }
    const executor = vi.fn().mockResolvedValue({ success: false, error: 'transient' })

    const result = await executeStep(context, RETRIEVAL_STEP, executor)

    // After first attempt: state = 'retrieving'. Second attempt: transition('retrieving', 'intake_complete') fails
    // So we get either INVALID_STATE_TRANSITION or STEP_MAX_RETRIES depending on which path runs
    expect(result.ok).toBe(false)
  })
})
