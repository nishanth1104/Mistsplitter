/**
 * Append-only audit logger.
 *
 * This module is the ONLY approved path for writing to the audit_logs table.
 * There are NO update or delete operations exported from this module — by design.
 *
 * Security: never modify or delete audit records.
 */

import { db, ids, logger, type AuditLog } from '@mistsplitter/core'
import { ok, err, type Result } from '@mistsplitter/core'
import type { AuditEventInput, AuditError } from './types.js'

/**
 * Write an audit event. This is the only approved write path for audit_logs.
 * Never fails silently — returns Err if the write fails.
 */
export async function writeAuditEvent(
  event: AuditEventInput,
): Promise<Result<AuditLog, AuditError>> {
  const logId = ids.auditLog()
  const payload: Record<string, unknown> = { ...event.payload }

  // Attach correlation ID to every event payload if provided
  if (event.correlationId) {
    payload['correlationId'] = event.correlationId
  }

  try {
    const record = await db.auditLog.create({
      data: {
        logId,
        caseId: event.caseId ?? null,
        actorType: event.actorType,
        actorId: event.actorId,
        actorRole: event.actorRole,
        action: event.action,
        payloadJson: payload,
      },
    })

    return ok({
      logId: record.logId,
      caseId: record.caseId,
      actorType: record.actorType as AuditLog['actorType'],
      actorId: record.actorId,
      actorRole: record.actorRole as AuditLog['actorRole'],
      action: record.action,
      payloadJson: record.payloadJson,
      createdAt: record.createdAt,
    })
  } catch (cause) {
    logger.error({ err: cause, event }, 'Failed to write audit event')
    return err({
      code: 'AUDIT_WRITE_FAILED',
      message: 'Failed to write audit event to database',
      cause,
    })
  }
}

// ─── INTENTIONALLY NO update() or delete() exports ────────────────────────────
// The audit log is append-only. Attempting to update or delete records
// violates the audit integrity model. If you need to annotate, write a new event.
