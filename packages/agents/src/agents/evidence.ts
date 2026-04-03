/**
 * EvidenceAgent executor — assembles a structured evidence bundle from signals and evidence rows.
 * Runs in the `assembling_evidence` workflow state.
 */

import { db, ids } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import type { StepResult } from '../types.js'

export async function runEvidenceAgent(caseId: string, runId: string): Promise<StepResult> {
  try {
    const caseRecord = await db.case.findUnique({ where: { caseId } })
    if (!caseRecord) {
      return { success: false, error: `Case not found: ${caseId}` }
    }
    const correlationId = caseRecord.correlationId ?? undefined

    // Fetch all signals
    const signals = await db.riskSignal.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    })

    // Fetch all evidence rows (except signal_summary to avoid recursion)
    const evidenceRows = await db.caseEvidence.findMany({
      where: { caseId, evidenceType: { not: 'signal_summary' } },
      orderBy: { createdAt: 'asc' },
    })

    // Determine overall risk level from signals
    const highRiskSignals = ['high_amount', 'pep_customer', 'rapid_succession', 'unusual_merchant_category']
    const triggeredHighRisk = signals.filter((s) => highRiskSignals.includes(s.signalName))
    const riskLevel =
      triggeredHighRisk.length >= 2 ? 'high' : triggeredHighRisk.length === 1 ? 'medium' : 'low'

    // Build the evidence bundle (signal_summary type)
    const bundle = {
      caseId,
      correlationId,
      assembledAt: new Date().toISOString(),
      riskLevel,
      signalCount: signals.length,
      signals: signals.map((s) => ({
        name: s.signalName,
        value: s.signalValue,
        reason: s.signalReason,
      })),
      evidenceSources: evidenceRows.map((e) => ({
        type: e.evidenceType,
        id: e.evidenceId,
        assembledAt: e.createdAt,
      })),
      topSignals: triggeredHighRisk.map((s) => s.signalName),
    }

    // Write the assembled bundle as a signal_summary evidence row
    await db.caseEvidence.create({
      data: {
        evidenceId: ids.evidence(),
        caseId,
        evidenceType: 'signal_summary',
        payloadJson: bundle,
      },
    })

    await writeAuditEvent({
      caseId,
      actorType: 'agent',
      actorId: 'EvidenceAgent',
      actorRole: 'workflow-agent',
      action: AuditActions.AGENT_COMPLETED,
      payload: {
        step: 'evidence',
        runId,
        signalCount: signals.length,
        evidenceSourceCount: evidenceRows.length,
        riskLevel,
      },
      correlationId,
    })

    return {
      success: true,
      data: { riskLevel, signalCount: signals.length },
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { success: false, error: `EvidenceAgent failed: ${message}` }
  }
}
