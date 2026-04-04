/**
 * Workflow Runtime — main orchestrator for the risk_review workflow.
 *
 * Creates a WorkflowRun record, drives agents through the state machine,
 * propagates the correlation ID to every audit event.
 */

import { db, ids, logger } from '@mistsplitter/core'
import { ok, err, type Result } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import { isTerminalState, requiresHumanAction } from './states/risk-review.js'
import type { WorkflowContext, WorkflowError, WorkflowRunRecord, WorkflowStep, StepResult } from './types.js'

export type StepExecutorMap = Map<string, () => Promise<StepResult>>

/**
 * Start a new workflow run for a case.
 * Returns the WorkflowRun record.
 */
export async function startWorkflowRun(
  caseId: string,
  correlationId: string,
  workflowName = 'risk_review',
): Promise<Result<WorkflowRunRecord, WorkflowError>> {
  // Check if there's already a running workflow for this case
  const existing = await db.workflowRun.findFirst({
    where: { caseId, status: 'running' },
  })

  if (existing) {
    return err({
      code: 'WORKFLOW_ALREADY_RUNNING',
      message: `A workflow run is already active for case ${caseId}: ${existing.runId}`,
    })
  }

  const runId = ids.workflowRun()

  try {
    const run = await db.workflowRun.create({
      data: {
        runId,
        caseId,
        workflowName,
        state: 'pending',
        status: 'running',
      },
    })

    await writeAuditEvent({
      caseId,
      actorType: 'system',
      actorId: 'workflow-runtime',
      actorRole: 'workflow-agent',
      action: AuditActions.WORKFLOW_STARTED,
      payload: { runId, workflowName, correlationId },
      correlationId,
    })

    logger.info({ runId, caseId, workflowName }, 'Workflow run started')

    return ok({
      runId: run.runId,
      caseId: run.caseId,
      workflowName: run.workflowName,
      state: 'pending',
      status: 'running',
      startedAt: run.startedAt,
    })
  } catch (cause) {
    logger.error({ err: cause, caseId }, 'Failed to create workflow run')
    return err({
      code: 'STEP_FAILED',
      message: `Failed to create workflow run: ${cause instanceof Error ? cause.message : String(cause)}`,
    })
  }
}

/**
 * Execute the full risk_review workflow.
 * Each step is a function that returns StepResult.
 * The runtime drives state transitions and writes audit events.
 */
export async function executeWorkflow(
  run: WorkflowRunRecord,
  steps: WorkflowStep[],
  executors: StepExecutorMap,
  correlationId: string,
): Promise<Result<WorkflowRunRecord, WorkflowError>> {
  const context: WorkflowContext = {
    runId: run.runId,
    caseId: run.caseId,
    correlationId,
    workflowName: run.workflowName,
    currentState: run.state,
    startedAt: run.startedAt,
  }

  for (const step of steps) {
    if (isTerminalState(context.currentState)) break
    if (requiresHumanAction(context.currentState)) break

    const executor = executors.get(step.name)
    if (!executor) {
      logger.error({ step: step.name }, 'No executor registered for step')
      continue
    }

    const { executeStep } = await import('./runner.js')
    const result = await executeStep(context, step, executor)

    if (!result.ok) {
      await writeAuditEvent({
        caseId: context.caseId,
        actorType: 'system',
        actorId: 'workflow-runtime',
        actorRole: 'workflow-agent',
        action: AuditActions.WORKFLOW_FAILED,
        payload: { runId: run.runId, error: result.error },
        correlationId,
      })

      return err(result.error)
    }
  }

  const finalState = context.currentState
  const isComplete = isTerminalState(finalState) || requiresHumanAction(finalState)

  if (isComplete) {
    const status = finalState === 'closed' ? 'completed' : 'running'

    try {
      await db.workflowRun.update({
        where: { runId: run.runId },
        data: {
          state: finalState,
          status,
          // Set endedAt for terminal state OR when paused at human review gate
          ...(status === 'completed' || requiresHumanAction(finalState) ? { endedAt: new Date() } : {}),
        },
      })
    } catch (cause) {
      logger.error({ err: cause, runId: run.runId }, 'Failed to finalize workflow run')
    }

    if (finalState === 'closed') {
      await writeAuditEvent({
        caseId: context.caseId,
        actorType: 'system',
        actorId: 'workflow-runtime',
        actorRole: 'workflow-agent',
        action: AuditActions.WORKFLOW_COMPLETED,
        payload: { runId: run.runId, finalState },
        correlationId,
      })
    }
  }

  return ok({
    ...run,
    state: finalState,
    status: finalState === 'closed' ? 'completed' : 'running',
  })
}
