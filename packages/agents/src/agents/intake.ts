/**
 * IntakeAgent executor — validates alert and marks intake complete.
 * Runs in the `intake` workflow state.
 */

import { db } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import type { StepResult } from '../types.js'

export async function runIntakeAgent(caseId: string, runId: string): Promise<StepResult> {
  try {
    // Fetch case with alert
    const caseRecord = await db.case.findUnique({
      where: { caseId },
      include: { alert: true },
    })

    if (!caseRecord) {
      return { success: false, error: `Case not found: ${caseId}` }
    }

    if (!caseRecord.alert) {
      return { success: false, error: `No alert linked to case: ${caseId}` }
    }

    const alert = caseRecord.alert

    // Validate required alert fields
    if (!alert.alertId || !alert.transactionId || !alert.alertType || !alert.severity) {
      return { success: false, error: 'Alert missing required fields' }
    }

    // Update case status to in_review
    await db.case.update({
      where: { caseId },
      data: { status: 'in_review' },
    })

    await writeAuditEvent({
      caseId,
      actorType: 'agent',
      actorId: 'IntakeAgent',
      actorRole: 'workflow-agent',
      action: AuditActions.AGENT_COMPLETED,
      payload: {
        step: 'intake',
        runId,
        alertId: alert.alertId,
        alertType: alert.alertType,
        severity: alert.severity,
      },
      correlationId: caseRecord.correlationId ?? undefined,
    })

    return {
      success: true,
      data: { alertId: alert.alertId, alertType: alert.alertType, severity: alert.severity },
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { success: false, error: `IntakeAgent failed: ${message}` }
  }
}
