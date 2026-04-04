import { db, logger } from '@mistsplitter/core'
import { ok, err, type Result } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import { transition } from './states/risk-review.js'
import type { WorkflowContext, WorkflowStep, StepResult, WorkflowError } from './types.js'
import type { RiskReviewEvent, RiskReviewState } from '@mistsplitter/core'

/**
 * Execute a single workflow step with retry support.
 * Records audit events before and after execution.
 */
export async function executeStep(
  context: WorkflowContext,
  step: WorkflowStep,
  executor: () => Promise<StepResult>,
): Promise<Result<RiskReviewState, WorkflowError>> {
  const maxRetries = step.maxRetries ?? 0
  let lastError: string | undefined

  // Fire the state transition once before the first attempt
  const startedEvent = step.event as RiskReviewEvent
  let startedNextState: RiskReviewState
  try {
    startedNextState = transition(context.currentState, startedEvent)
  } catch (e) {
    return err({
      code: 'INVALID_STATE_TRANSITION',
      message: e instanceof Error ? e.message : String(e),
      state: context.currentState,
      event: startedEvent,
    })
  }
  await updateWorkflowState(context.runId, startedNextState, 'running')
  context.currentState = startedNextState

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Write agent.invoked audit event before execution
    await writeAuditEvent({
      caseId: context.caseId,
      actorType: 'agent',
      actorId: step.agentName,
      actorRole: 'workflow-agent',
      action: AuditActions.AGENT_INVOKED,
      payload: {
        step: step.name,
        event: step.event,
        attempt: attempt + 1,
        maxRetries: step.maxRetries ?? 0,
      },
      correlationId: context.correlationId,
    })

    try {
      const result = await executor()

      if (result.success) {
        await writeAuditEvent({
          caseId: context.caseId,
          actorType: 'agent',
          actorId: step.agentName,
          actorRole: 'workflow-agent',
          action: AuditActions.AGENT_COMPLETED,
          payload: { step: step.name, data: result.data },
          correlationId: context.correlationId,
        })

        logger.info(
          { step: step.name, state: context.currentState, caseId: context.caseId },
          'Workflow step completed',
        )

        return ok(context.currentState)
      }

      lastError = result.error ?? 'Unknown error'
      logger.warn(
        { step: step.name, attempt: attempt + 1, error: lastError },
        'Workflow step failed, may retry',
      )
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause)
      logger.error(
        { step: step.name, attempt: attempt + 1, err: cause },
        'Workflow step threw exception',
      )
    }
  }

  // All retries exhausted — write failure audit event
  await writeAuditEvent({
    caseId: context.caseId,
    actorType: 'agent',
    actorId: step.agentName,
    actorRole: 'workflow-agent',
    action: AuditActions.AGENT_FAILED,
    payload: { step: step.name, error: lastError, maxRetries },
    correlationId: context.correlationId,
  })

  await updateWorkflowState(context.runId, 'failed', 'failed')

  return err({
    code: 'STEP_MAX_RETRIES',
    message: `Step '${step.name}' failed after ${maxRetries + 1} attempt(s): ${lastError}`,
  })
}

async function updateWorkflowState(
  runId: string,
  state: RiskReviewState,
  status: 'running' | 'completed' | 'failed' | 'replaying',
): Promise<void> {
  try {
    await db.workflowRun.update({
      where: { runId },
      data: {
        state,
        status,
        ...(status === 'completed' || status === 'failed' ? { endedAt: new Date() } : {}),
      },
    })
  } catch (cause) {
    logger.error({ err: cause, runId, state, status }, 'Failed to update workflow run state')
  }
}
