import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@mistsplitter/audit', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true }),
  AuditActions: {
    WORKFLOW_STARTED: 'workflow.started',
    WORKFLOW_COMPLETED: 'workflow.completed',
    WORKFLOW_FAILED: 'workflow.failed',
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
      workflowRun: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    },
    ids: { workflowRun: vi.fn().mockReturnValue('run_abc') },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

import { startWorkflowRun, executeWorkflow } from '../runtime.js'
import type { WorkflowRunRecord, WorkflowStep } from '../types.js'

const STEPS: WorkflowStep[] = [
  { name: 'intake', event: 'intake_started', agentName: 'IntakeAgent', maxRetries: 0 },
  { name: 'retrieval', event: 'intake_complete', agentName: 'RetrievalAgent', maxRetries: 0 },
]

const BASE_RUN: WorkflowRunRecord = {
  runId: 'run_1',
  caseId: 'case_1',
  workflowName: 'risk_review',
  state: 'pending',
  status: 'running',
  startedAt: new Date(),
}

describe('startWorkflowRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok with run record when no existing run', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.workflowRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(db.workflowRun.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      runId: 'run_abc', caseId: 'case_1', workflowName: 'risk_review',
      state: 'pending', status: 'running', startedAt: new Date(),
    })

    const result = await startWorkflowRun('case_1', 'corr_1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value?.caseId).toBe('case_1')
  })

  it('returns err when workflow already running for case', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.workflowRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      runId: 'existing_run', status: 'running',
    })

    const result = await startWorkflowRun('case_1', 'corr_1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error?.code).toBe('WORKFLOW_ALREADY_RUNNING')
  })
})

describe('executeWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('breaks at awaiting_review and sets endedAt', async () => {
    const { db } = await import('@mistsplitter/core')

    // Only intake step — it transitions to 'intake', then policy_gate would take to 'awaiting_review'
    // We simulate reaching awaiting_review directly via policy_gate step
    const policyGateStep: WorkflowStep = {
      name: 'policy_gate', event: 'policy_permitted', agentName: 'system', maxRetries: 0,
    }

    const executors = new Map([
      ['intake', vi.fn().mockResolvedValue({ success: true })],
      ['retrieval', vi.fn().mockResolvedValue({ success: true })],
    ])

    // Only run intake + retrieval steps; retrieval brings us to computing_signals
    // We need the full pipeline to reach awaiting_review in a short test
    // Easier: test with a single policy_gate step starting from awaiting_policy
    const run: WorkflowRunRecord = { ...BASE_RUN, state: 'awaiting_policy' }
    const policyExecutors = new Map([
      ['policy_gate', vi.fn().mockResolvedValue({ success: true })],
    ])

    await executeWorkflow(run, [policyGateStep], policyExecutors, 'corr_1')

    // After policy_gate the state is 'awaiting_review' → requiresHumanAction = true → endedAt set
    expect(db.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ endedAt: expect.any(Date) }),
      }),
    )
    void executors
  })

  it('skips steps with no registered executor', async () => {
    const run: WorkflowRunRecord = { ...BASE_RUN }
    const executors = new Map<string, () => Promise<{ success: boolean }>>() // empty — no executors
    const { logger } = await import('@mistsplitter/core')

    await executeWorkflow(run, STEPS, executors, 'corr_1')

    // Should log an error for each unregistered step
    expect(logger.error).toHaveBeenCalled()
  })

  it('returns err when a step fails and propagates error', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.workflowRun.update as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const run: WorkflowRunRecord = { ...BASE_RUN }
    const executors = new Map([
      ['intake', vi.fn().mockResolvedValue({ success: false, error: 'intake exploded' })],
    ])

    const result = await executeWorkflow(run, [STEPS[0]!], executors, 'corr_1')

    expect(result.ok).toBe(false)
  })
})
