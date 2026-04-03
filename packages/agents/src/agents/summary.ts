/**
 * SummaryAgent executor — calls LLM to generate a structured recommendation from the evidence bundle.
 * Runs in the `generating_summary` workflow state.
 *
 * Security: LLM receives ONLY the structured evidence bundle. No raw DB records, no PII beyond what's bundled.
 * LLM output is validated with Zod before writing to the recommendations table.
 */

import Anthropic from '@anthropic-ai/sdk'
import { db, ids, getConfig } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import type { StepResult } from '../types.js'
import { z } from 'zod'

// Strict Zod schema — LLM output must match or the step fails
const SummaryOutputSchema = z.object({
  recommended_action: z.enum(['clear', 'review_further', 'escalate']),
  summary: z.string().min(1).max(500),
  confidence: z.enum(['low', 'medium', 'high']),
  evidence_references: z.array(z.string()),
})

type SummaryOutput = z.infer<typeof SummaryOutputSchema>

export async function runSummaryAgent(caseId: string, runId: string): Promise<StepResult> {
  try {
    const caseRecord = await db.case.findUnique({ where: { caseId } })
    if (!caseRecord) {
      return { success: false, error: `Case not found: ${caseId}` }
    }
    const correlationId = caseRecord.correlationId ?? undefined

    // Fetch the evidence bundle (signal_summary type)
    const bundleEvidence = await db.caseEvidence.findFirst({
      where: { caseId, evidenceType: 'signal_summary' },
      orderBy: { createdAt: 'desc' },
    })

    if (!bundleEvidence) {
      return { success: false, error: `No evidence bundle found for case ${caseId}` }
    }

    const bundle = bundleEvidence.payloadJson as Record<string, unknown>

    // Build LLM prompt from structured bundle only
    const prompt = buildPrompt(bundle)

    await writeAuditEvent({
      caseId,
      actorType: 'agent',
      actorId: 'SummaryAgent',
      actorRole: 'workflow-agent',
      action: AuditActions.SUMMARY_GENERATION_STARTED,
      payload: { step: 'summary', runId, evidenceBundleId: bundleEvidence.evidenceId },
      correlationId,
    })

    // Call LLM — claude-haiku for speed
    const config = getConfig()
    const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText =
      response.content[0]?.type === 'text' ? response.content[0].text : ''

    // Parse JSON from LLM response
    let parsed: unknown
    try {
      // Extract JSON block if wrapped in markdown code fence
      const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(rawText)
      parsed = JSON.parse(jsonMatch ? jsonMatch[1]! : rawText)
    } catch {
      await writeAuditEvent({
        caseId,
        actorType: 'agent',
        actorId: 'SummaryAgent',
        actorRole: 'workflow-agent',
        action: AuditActions.SUMMARY_GENERATION_FAILED,
        payload: { step: 'summary', runId, error: 'LLM response was not valid JSON', rawText },
        correlationId,
      })
      return { success: false, error: 'LLM response was not valid JSON' }
    }

    // Validate LLM output — untrusted until Zod says otherwise
    const validation = SummaryOutputSchema.safeParse(parsed)
    if (!validation.success) {
      await writeAuditEvent({
        caseId,
        actorType: 'agent',
        actorId: 'SummaryAgent',
        actorRole: 'workflow-agent',
        action: AuditActions.SUMMARY_GENERATION_FAILED,
        payload: {
          step: 'summary',
          runId,
          error: 'LLM output failed Zod validation',
          issues: validation.error.issues,
        },
        correlationId,
      })
      return { success: false, error: `LLM output validation failed: ${validation.error.message}` }
    }

    const output: SummaryOutput = validation.data

    // Write recommendation to DB
    const recommendationId = ids.recommendation()
    await db.recommendation.create({
      data: {
        recommendationId,
        caseId,
        recommendedAction: output.recommended_action,
        summary: output.summary,
        confidence: output.confidence,
        evidenceReferences: output.evidence_references,
      },
    })

    await writeAuditEvent({
      caseId,
      actorType: 'agent',
      actorId: 'SummaryAgent',
      actorRole: 'workflow-agent',
      action: AuditActions.SUMMARY_GENERATED,
      payload: {
        step: 'summary',
        runId,
        recommendationId,
        recommendedAction: output.recommended_action,
        confidence: output.confidence,
      },
      correlationId,
    })

    return {
      success: true,
      data: {
        recommendationId,
        recommendedAction: output.recommended_action,
        confidence: output.confidence,
      },
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { success: false, error: `SummaryAgent failed: ${message}` }
  }
}

function buildPrompt(bundle: Record<string, unknown>): string {
  return `You are a fintech risk analyst AI assistant. Analyze the following risk evidence bundle for a suspicious transaction case and return a structured recommendation.

EVIDENCE BUNDLE:
${JSON.stringify(bundle, null, 2)}

Based on this evidence, respond with ONLY a JSON object in this exact format (no markdown, no explanation):
{
  "recommended_action": "<clear|review_further|escalate>",
  "summary": "<concise risk assessment in 1-3 sentences, max 500 chars>",
  "confidence": "<low|medium|high>",
  "evidence_references": ["<list of signal names or evidence types that influenced this decision>"]
}

Rules:
- "clear" = low risk, no further action needed
- "review_further" = moderate risk, human review recommended
- "escalate" = high risk, immediate senior review required
- Base your decision ONLY on the provided evidence bundle
- Do not invent facts not present in the bundle`
}
