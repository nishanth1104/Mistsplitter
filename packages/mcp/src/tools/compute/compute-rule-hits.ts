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

const HIGH_RISK_COUNTRIES = ['IR', 'KP', 'SY', 'CU', 'VE', 'MM', 'AF']

interface RuleHit {
  ruleName: string
  signalValue: number
  reason: string
}

export async function handleComputeRuleHits(
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

  await checkPermission({ actor, toolName: 'compute_rule_hits', caseId: case_id }, registry)

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
    },
  })

  if (!caseRecord) {
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_FAILED,
      payload: { toolName: 'compute_rule_hits', reason: 'Case not found', case_id },
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
  const amount = transaction.amount.toNumber()
  const accountId = account.accountId

  const hits: RuleHit[] = []

  // Rule 1: HIGH_AMOUNT — amount > 10000
  if (amount > 10000) {
    hits.push({
      ruleName: 'HIGH_AMOUNT',
      signalValue: amount,
      reason: `Transaction amount $${amount.toFixed(2)} exceeds $10,000 threshold`,
    })
  }

  // Rule 2: STRUCTURING — 2+ transactions between $9000-$9999 within 24h on same account
  const twentyFourHoursAgo = new Date(transaction.timestamp.getTime() - 24 * 60 * 60 * 1000)
  const structuringTxns = await db.transaction.count({
    where: {
      accountId,
      amount: { gte: 9000, lte: 9999 },
      timestamp: { gte: twentyFourHoursAgo, lte: transaction.timestamp },
    },
  })
  if (structuringTxns >= 2) {
    hits.push({
      ruleName: 'STRUCTURING',
      signalValue: structuringTxns,
      reason: `${structuringTxns} transactions between $9,000–$9,999 detected within 24 hours (structuring pattern)`,
    })
  }

  // Rule 3: RAPID_SUCCESSION — 3+ transactions within 1 hour on same account
  const oneHourAgo = new Date(transaction.timestamp.getTime() - 60 * 60 * 1000)
  const rapidCount = await db.transaction.count({
    where: {
      accountId,
      timestamp: { gte: oneHourAgo, lte: transaction.timestamp },
    },
  })
  if (rapidCount >= 3) {
    hits.push({
      ruleName: 'RAPID_SUCCESSION',
      signalValue: rapidCount,
      reason: `${rapidCount} transactions in a 1-hour window on the same account`,
    })
  }

  // Rule 4: UNUSUAL_MERCHANT — merchant.riskTag === 'restricted'
  if (merchant && merchant.riskTag === 'restricted') {
    hits.push({
      ruleName: 'UNUSUAL_MERCHANT',
      signalValue: 1,
      reason: `Transaction involves a restricted merchant: ${merchant.name} (${merchant.merchantId})`,
    })
  }

  // Rule 5: HIGH_RISK_COUNTRY — merchant country in sanctioned list
  if (merchant && HIGH_RISK_COUNTRIES.includes(merchant.country)) {
    hits.push({
      ruleName: 'HIGH_RISK_COUNTRY',
      signalValue: 1,
      reason: `Merchant country '${merchant.country}' is on the high-risk jurisdiction list`,
    })
  }

  // Rule 6: ACCOUNT_SUSPENDED — account status suspended
  if (account.status === 'suspended') {
    hits.push({
      ruleName: 'ACCOUNT_SUSPENDED',
      signalValue: 1,
      reason: `Transaction originated from a suspended account: ${accountId}`,
    })
  }

  // Rule 7: HIGH_RISK_CUSTOMER — customer riskTier is pep or high
  if (customer.riskTier === 'pep' || customer.riskTier === 'high') {
    hits.push({
      ruleName: 'HIGH_RISK_CUSTOMER',
      signalValue: 1,
      reason: `Customer risk tier is '${customer.riskTier}' — elevated scrutiny required`,
    })
  }

  // Write risk_signals rows for each hit
  await Promise.all(
    hits.map((hit) =>
      db.riskSignal.create({
        data: {
          signalId: ids.signal(),
          caseId: case_id,
          signalName: hit.ruleName,
          signalValue: hit.signalValue,
          signalReason: hit.reason,
        },
      }),
    ),
  )

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.TOOL_CALLED,
    payload: { toolName: 'compute_rule_hits', case_id, hitsCount: hits.length, ruleNames: hits.map((h) => h.ruleName) },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.info({ caseId: case_id, hitsCount: hits.length, actorId: actor.id }, 'compute_rule_hits completed')

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          case_id,
          hitsCount: hits.length,
          hits: hits.map((h) => ({
            ruleName: h.ruleName,
            signalValue: h.signalValue,
            reason: h.reason,
          })),
        }),
      },
    ],
  }
}
