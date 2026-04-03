import { z } from 'zod'
import { db, logger } from '@mistsplitter/core'
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

// Weights per rule name
const SIGNAL_WEIGHTS: Record<string, number> = {
  HIGH_AMOUNT: 25,
  STRUCTURING: 30,
  RAPID_SUCCESSION: 20,
  UNUSUAL_MERCHANT: 15,
  HIGH_RISK_COUNTRY: 20,
  ACCOUNT_SUSPENDED: 25,
  HIGH_RISK_CUSTOMER: 20,
}

export async function handleComputeRiskSignals(
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

  await checkPermission({ actor, toolName: 'compute_risk_signals', caseId: case_id }, registry)

  const caseRecord = await db.case.findUnique({ where: { caseId: case_id } })
  if (!caseRecord) {
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_FAILED,
      payload: { toolName: 'compute_risk_signals', reason: 'Case not found', case_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', case_id }) }],
      isError: true,
    }
  }

  const signals = await db.riskSignal.findMany({
    where: { caseId: case_id },
    orderBy: { signalValue: 'desc' },
  })

  // Compute composite score (sum of weights, capped at 100)
  let compositeScore = 0
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.signalName] ?? 10
    compositeScore += weight
  }
  compositeScore = Math.min(compositeScore, 100)

  // Compute amount deviation (z-score approximation) if HIGH_AMOUNT hit
  let amountDeviation: number | null = null
  const highAmountSignal = signals.find((s) => s.signalName === 'HIGH_AMOUNT')
  if (highAmountSignal) {
    // Get account's recent transaction amounts to compute z-score
    const caseWithTxn = await db.case.findUnique({
      where: { caseId: case_id },
      include: {
        alert: {
          include: { transaction: true },
        },
      },
    })

    if (caseWithTxn) {
      const accountId = caseWithTxn.alert.transaction.accountId
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const recentAmounts = await db.transaction.findMany({
        where: { accountId, timestamp: { gte: thirtyDaysAgo } },
        select: { amount: true },
      })

      if (recentAmounts.length > 1) {
        const nums = recentAmounts.map((t) => t.amount.toNumber())
        const mean = nums.reduce((a, b) => a + b, 0) / nums.length
        const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length
        const stdDev = Math.sqrt(variance)
        const txnAmount = highAmountSignal.signalValue.toNumber()
        amountDeviation = stdDev > 0 ? Math.round(((txnAmount - mean) / stdDev) * 100) / 100 : null
      }
    }
  }

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.TOOL_CALLED,
    payload: { toolName: 'compute_risk_signals', case_id, compositeScore, signalCount: signals.length },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.info({ caseId: case_id, compositeScore, signalCount: signals.length, actorId: actor.id }, 'compute_risk_signals completed')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          case_id,
          composite_score: compositeScore,
          ...(amountDeviation !== null ? { amount_deviation: amountDeviation } : {}),
          signals: signals.map((s) => ({
            signalId: s.signalId,
            signalName: s.signalName,
            signalValue: s.signalValue.toString(),
            signalReason: s.signalReason,
            createdAt: s.createdAt.toISOString(),
          })),
        }),
      },
    ],
  }
}
