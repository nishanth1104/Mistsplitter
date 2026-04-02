import { db, ids, logger } from '@mistsplitter/core'
import { ok, err, type Result } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import { riskReviewRules } from './rules/risk-review.js'
import type { PolicyContext, PolicyDecision, PolicyError } from './types.js'

/**
 * Evaluate policy for a workflow context.
 *
 * - dryRun: true → returns decision without writing to policy_events or audit_logs
 * - dryRun: false (default) → writes policy_event and audit_log records
 *
 * Security: every non-dry-run evaluation is audited.
 */
export async function evaluatePolicy(
  context: PolicyContext,
): Promise<Result<PolicyDecision, PolicyError>> {
  const rules = getRulesForWorkflow(context.workflowName)

  // Evaluate rules in order — first match wins
  let decision: PolicyDecision | null = null
  for (const rule of rules) {
    const result = rule.evaluate(context)
    if (result !== null) {
      decision = result
      break
    }
  }

  if (!decision) {
    decision = {
      decision: 'permitted',
      rationale: 'No rules matched — default permit',
    }
  }

  // Skip persistence in dry-run mode
  if (context.dryRun) {
    logger.debug(
      { caseId: context.caseId, decision: decision.decision, dryRun: true },
      'Policy evaluation (dry-run)',
    )
    return ok(decision)
  }

  // Persist policy event
  try {
    await db.policyEvent.create({
      data: {
        policyEventId: ids.policyEvent(),
        caseId: context.caseId,
        agentId: context.agentId,
        decision: decision.decision,
        rationale: decision.rationale,
      },
    })
  } catch (cause) {
    logger.error({ err: cause, context }, 'Failed to write policy event')
    return err({
      code: 'POLICY_EVAL_FAILED',
      message: 'Failed to persist policy evaluation result',
      cause,
    })
  }

  // Write audit event
  await writeAuditEvent({
    caseId: context.caseId,
    actorType: 'agent',
    actorId: context.agentId,
    actorRole: 'workflow-agent',
    action:
      decision.decision === 'blocked'
        ? AuditActions.POLICY_BLOCKED
        : AuditActions.POLICY_EVALUATED,
    payload: {
      decision: decision.decision,
      rationale: decision.rationale,
      workflowName: context.workflowName,
    },
    correlationId: context.correlationId,
  })

  logger.info(
    { caseId: context.caseId, decision: decision.decision },
    'Policy evaluated',
  )

  return ok(decision)
}

function getRulesForWorkflow(workflowName: string) {
  switch (workflowName) {
    case 'risk_review':
      return riskReviewRules
    default:
      return riskReviewRules // Default to risk_review rules
  }
}
