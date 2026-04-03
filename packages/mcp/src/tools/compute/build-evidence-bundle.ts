import { z } from 'zod'
import { db, ids, logger } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import type { AgentRegistry } from '@mistsplitter/agents'
import { checkPermission } from '../../permissions.js'
import { toActor } from '../../types.js'
import type { Actor, McpToolResponse } from '../../types.js'

const InputSchema = z.object({
  actor: z.object({
    type: z.enum(['agent', 'reviewer', 'system', 'cli', 'api']),
    id: z.string(),
    role: z.enum(['analyst', 'reviewer', 'manager', 'admin', 'platform-engineer', 'workflow-agent']),
    agentId: z.string().optional(),
    correlationId: z.string().optional(),
  }),
  case_id: z.string(),
})

const SIGNAL_WEIGHTS: Record<string, number> = {
  HIGH_AMOUNT: 25,
  STRUCTURING: 30,
  RAPID_SUCCESSION: 20,
  UNUSUAL_MERCHANT: 15,
  HIGH_RISK_COUNTRY: 20,
  ACCOUNT_SUSPENDED: 25,
  HIGH_RISK_CUSTOMER: 20,
}

export async function handleBuildEvidenceBundle(
  params: Record<string, unknown>,
  registry: AgentRegistry,
): Promise<McpToolResponse> {
  const parsed = InputSchema.safeParse(params)
  if (!parsed.success) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten() }) }],
      isError: true,
    }
  }

  const { actor: actorInput, case_id } = parsed.data
  const actor = toActor(actorInput)

  await checkPermission({ actor, toolName: 'build_evidence_bundle', caseId: case_id }, registry)

  const caseRecord = await db.case.findUnique({
    where: { caseId: case_id },
    include: {
      alert: {
        include: {
          transaction: {
            include: {
              account: {
                include: { customer: true },
              },
              merchant: true,
            },
          },
        },
      },
      riskSignals: {
        orderBy: { signalValue: 'desc' },
      },
    },
  })

  if (!caseRecord) {
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_FAILED,
      payload: { toolName: 'build_evidence_bundle', reason: 'Case not found', case_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', case_id }) }],
      isError: true,
    }
  }

  const transaction = caseRecord.alert.transaction
  const account = transaction.account
  const customer = account.customer
  const merchant = transaction.merchant
  const signals = caseRecord.riskSignals

  // Composite score
  let compositeScore = 0
  for (const signal of signals) {
    compositeScore += SIGNAL_WEIGHTS[signal.signalName] ?? 10
  }
  compositeScore = Math.min(compositeScore, 100)

  // Transaction count and avg amount in last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const recentTxns = await db.transaction.findMany({
    where: { accountId: account.accountId, timestamp: { gte: thirtyDaysAgo } },
    select: { amount: true },
  })
  const transactionCount30d = recentTxns.length
  const avgAmount30d =
    transactionCount30d > 0
      ? Math.round((recentTxns.reduce((sum, t) => sum + t.amount.toNumber(), 0) / transactionCount30d) * 100) / 100
      : 0

  // Prior alert count on same account
  const priorAlertCount = await db.alert.count({
    where: {
      alertId: { not: caseRecord.alertId },
      transaction: { accountId: account.accountId },
    },
  })

  const bundle = {
    case_id,
    assembled_at: new Date().toISOString(),
    top_signals: signals.map((s) => ({
      signalId: s.signalId,
      caseId: s.caseId,
      signalName: s.signalName,
      signalValue: s.signalValue.toString(),
      signalReason: s.signalReason,
      createdAt: s.createdAt.toISOString(),
    })),
    rule_hits: signals.map((s) => s.signalName),
    linked_entities: {
      customer_id: customer.customerId,
      account_id: account.accountId,
      merchant_id: merchant?.merchantId ?? null,
      transaction_id: transaction.transactionId,
      alert_id: caseRecord.alertId,
    },
    recent_event_summary: {
      transaction_count_30d: transactionCount30d,
      avg_amount_30d: avgAmount30d,
      prior_alert_count: priorAlertCount,
    },
    policy_references: ['risk_review_standard_v1'],
    composite_risk_score: compositeScore,
  }

  const evidenceId = ids.evidence()

  await db.caseEvidence.create({
    data: {
      evidenceId,
      caseId: case_id,
      evidenceType: 'signal_summary',
      payloadJson: bundle as object,
    },
  })

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.TOOL_CALLED,
    payload: { toolName: 'build_evidence_bundle', case_id, evidenceId, compositeScore },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.info({ caseId: case_id, evidenceId, compositeScore, actorId: actor.id }, 'build_evidence_bundle completed')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ evidence_id: evidenceId, ...bundle }),
      },
    ],
  }
}
