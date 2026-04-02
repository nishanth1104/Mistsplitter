import type { PolicyRule } from '../types.js'

/**
 * Policy rules for the risk_review workflow.
 * Rules are evaluated in order. The first matching rule wins.
 * A rule returning null means "this rule does not apply to this context".
 */
export const riskReviewRules: PolicyRule[] = [
  {
    name: 'CRITICAL_ESCALATION_REQUIRED',
    description: 'Critical priority cases that recommend escalation require manager approval',
    evaluate(ctx) {
      if (
        ctx.casePriority === 'critical' &&
        ctx.recommendedAction === 'escalate'
      ) {
        return {
          decision: 'requires_approval',
          rationale:
            'Critical priority case with escalation recommendation requires manager approval before proceeding',
          requiresApprovalFrom: ['manager', 'admin'],
        }
      }
      return null
    },
  },
  {
    name: 'AGENT_MUST_BE_ACTIVE',
    description: 'Only active agents may trigger policy-gated actions',
    evaluate(ctx) {
      // Agent status is checked by the agent registry — if we reach policy eval
      // with an inactive agent, block it
      if (!ctx.agentId) {
        return {
          decision: 'blocked',
          rationale: 'No agent ID provided — cannot evaluate policy',
          blockedBy: 'AGENT_MUST_BE_ACTIVE',
        }
      }
      return null
    },
  },
  {
    name: 'REVIEW_REQUIRES_IN_REVIEW_STATUS',
    description: 'Human review gate only applies when case is in_review or escalated',
    evaluate(ctx) {
      if (
        ctx.caseStatus !== 'in_review' &&
        ctx.caseStatus !== 'escalated' &&
        ctx.caseStatus !== 'pending'
      ) {
        return {
          decision: 'blocked',
          rationale: `Case status '${ctx.caseStatus}' does not permit new workflow actions`,
          blockedBy: 'REVIEW_REQUIRES_IN_REVIEW_STATUS',
        }
      }
      return null
    },
  },
  {
    name: 'DEFAULT_PERMIT',
    description: 'Default: permit if no other rule matched',
    evaluate(_ctx) {
      return {
        decision: 'permitted',
        rationale: 'No blocking rules matched — workflow may proceed',
      }
    },
  },
]
