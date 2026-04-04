/**
 * PolicyAgent executor — evaluates whether the workflow may proceed to human review.
 * Runs in the `awaiting_policy` workflow state.
 */

import { db } from '@mistsplitter/core'
import { evaluatePolicy } from '@mistsplitter/policy'
import type { StepResult } from '../types.js'

export async function runPolicyAgent(caseId: string, runId: string): Promise<StepResult> {
  try {
    const caseRecord = await db.case.findUnique({ where: { caseId } })
    if (!caseRecord) {
      return { success: false, error: `Case not found: ${caseId}` }
    }

    // Fetch the latest recommendation to pass to policy
    const recommendation = await db.recommendation.findFirst({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
    })

    const agentRecord = await db.agentRegistry.findFirst({ where: { name: 'PolicyAgent' } })
    const agentId = agentRecord?.agentId ?? 'PolicyAgent'

    const policyContext = {
      caseId,
      agentId,
      workflowName: 'risk_review',
      caseStatus: caseRecord.status as 'pending' | 'in_review' | 'escalated' | 'closed_clear' | 'closed_actioned',
      casePriority: caseRecord.priority as 'low' | 'medium' | 'high' | 'critical',
      dryRun: false as const,
      ...(caseRecord.correlationId ? { correlationId: caseRecord.correlationId } : {}),
      ...(recommendation?.recommendedAction
        ? { recommendedAction: recommendation.recommendedAction as 'clear' | 'review_further' | 'escalate' }
        : {}),
    }
    const result = await evaluatePolicy(policyContext)

    if (!result.ok) {
      return { success: false, error: `Policy evaluation failed: ${result.error.message}` }
    }

    const decision = result.value

    if (decision.decision === 'blocked') {
      return {
        success: false,
        error: `Policy blocked: ${decision.rationale}`,
      }
    }

    // permitted or requires_approval — workflow may proceed to human review
    return {
      success: true,
      data: {
        decision: decision.decision,
        rationale: decision.rationale,
        runId,
      },
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { success: false, error: `PolicyAgent failed: ${message}` }
  }
}
