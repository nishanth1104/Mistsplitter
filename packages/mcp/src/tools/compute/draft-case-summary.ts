import { z } from 'zod'
import OpenAI from 'openai'
import { db, ids, logger, getConfig, LLMValidationError } from '@mistsplitter/core'
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
  evidence_id: z.string(),
})

const SummaryOutputSchema = z.object({
  recommended_action: z.enum(['clear', 'review_further', 'escalate']),
  summary: z.string().max(500),
  confidence: z.enum(['low', 'medium', 'high']),
  evidence_references: z.array(z.string()),
})

interface EvidenceBundle {
  composite_risk_score: number
  rule_hits: string[]
  top_signals: Array<{ signalName: string; signalReason: string }>
  recent_event_summary: {
    transaction_count_30d: number
    avg_amount_30d: number
    prior_alert_count: number
  }
}

export async function handleDraftCaseSummary(
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

  const { actor: actorInput, case_id, evidence_id } = parsed.data
  const actor = toActor(actorInput)

  await checkPermission({ actor, toolName: 'draft_case_summary', caseId: case_id }, registry)

  // Read the evidence record
  const evidenceRecord = await db.caseEvidence.findUnique({
    where: { evidenceId: evidence_id },
  })

  if (!evidenceRecord || evidenceRecord.caseId !== case_id) {
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.TOOL_FAILED,
      payload: { toolName: 'draft_case_summary', reason: 'Evidence not found', evidence_id, case_id },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Evidence record not found', evidence_id, case_id }) }],
      isError: true,
    }
  }

  const bundle = evidenceRecord.payloadJson as unknown as EvidenceBundle

  const prompt = `You are a financial crime analyst reviewing a suspicious transaction case.

Case ID: ${case_id}
Risk Score: ${bundle.composite_risk_score}/100
Rule Hits: ${bundle.rule_hits.join(', ')}
Top Signals: ${bundle.top_signals.map((s) => s.signalName + ': ' + s.signalReason).join('\n')}
Recent Events: ${bundle.recent_event_summary.transaction_count_30d} transactions in 30d, avg $${bundle.recent_event_summary.avg_amount_30d}
Prior Alerts: ${bundle.recent_event_summary.prior_alert_count}

Respond with ONLY valid JSON matching this schema:
{
  "recommended_action": "clear" | "review_further" | "escalate",
  "summary": "string (max 500 chars)",
  "confidence": "low" | "medium" | "high",
  "evidence_references": ["string"]
}`

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.SUMMARY_GENERATION_STARTED,
    payload: { toolName: 'draft_case_summary', case_id, evidence_id },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  let rawContent: string
  try {
    const openai = new OpenAI({ apiKey: getConfig().OPENAI_API_KEY })
    const message = await openai.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: AbortSignal.timeout(30_000) },
    )

    const text = message.choices[0]?.message?.content
    if (!text) {
      throw new LLMValidationError('No text content in LLM response')
    }
    rawContent = text
  } catch (cause) {
    logger.error({ err: cause, caseId: case_id }, 'LLM call failed in draft_case_summary')
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.SUMMARY_GENERATION_FAILED,
      payload: {
        toolName: 'draft_case_summary',
        case_id,
        evidence_id,
        reason: cause instanceof Error ? cause.message : 'LLM call failed',
      },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'LLM call failed', case_id }) }],
      isError: true,
    }
  }

  // Parse and validate LLM output
  let parsedOutput: unknown
  try {
    parsedOutput = JSON.parse(rawContent)
  } catch {
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.SUMMARY_GENERATION_FAILED,
      payload: { toolName: 'draft_case_summary', case_id, evidence_id, reason: 'LLM output is not valid JSON' },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'LLM output validation failed: not valid JSON', case_id }) }],
      isError: true,
    }
  }

  const validationResult = SummaryOutputSchema.safeParse(parsedOutput)
  if (!validationResult.success) {
    await writeAuditEvent({
      caseId: case_id,
      actorType: actor.type,
      actorId: actor.id,
      actorRole: actor.role,
      action: AuditActions.SUMMARY_GENERATION_FAILED,
      payload: {
        toolName: 'draft_case_summary',
        case_id,
        evidence_id,
        reason: 'LLM output failed Zod schema validation',
        details: validationResult.error.flatten(),
      },
      ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
    })
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'LLM output validation failed',
            details: validationResult.error.flatten(),
            case_id,
          }),
        },
      ],
      isError: true,
    }
  }

  const output = validationResult.data

  // Persist recommendation
  const recommendationId = ids.recommendation()
  await db.recommendation.create({
    data: {
      recommendationId,
      caseId: case_id,
      recommendedAction: output.recommended_action,
      summary: output.summary,
      confidence: output.confidence,
      evidenceReferences: output.evidence_references,
    },
  })

  await writeAuditEvent({
    caseId: case_id,
    actorType: actor.type,
    actorId: actor.id,
    actorRole: actor.role,
    action: AuditActions.SUMMARY_GENERATED,
    payload: {
      toolName: 'draft_case_summary',
      case_id,
      evidence_id,
      recommendationId,
      recommendedAction: output.recommended_action,
      confidence: output.confidence,
    },
    ...(actor.correlationId !== undefined ? { correlationId: actor.correlationId } : {}),
  })

  logger.info(
    { caseId: case_id, recommendationId, recommendedAction: output.recommended_action, actorId: actor.id },
    'draft_case_summary completed',
  )

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          recommendation_id: recommendationId,
          case_id,
          recommended_action: output.recommended_action,
          summary: output.summary,
          confidence: output.confidence,
          evidence_references: output.evidence_references,
        }),
      },
    ],
  }
}
