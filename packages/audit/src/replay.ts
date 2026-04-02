import { db, logger, type AuditLog } from '@mistsplitter/core'
import { ok, err, type Result } from '@mistsplitter/core'
import type { AuditError } from './types.js'

/**
 * Fetch the complete ordered audit trail for a case.
 * Returns events in ascending created_at order (chronological).
 */
export async function replayCase(
  caseId: string,
): Promise<Result<AuditLog[], AuditError>> {
  try {
    const records = await db.auditLog.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    })

    const events: AuditLog[] = records.map((r) => ({
      logId: r.logId,
      caseId: r.caseId,
      actorType: r.actorType as AuditLog['actorType'],
      actorId: r.actorId,
      actorRole: r.actorRole as AuditLog['actorRole'],
      action: r.action,
      payloadJson: r.payloadJson as Record<string, unknown>,
      createdAt: r.createdAt,
    }))

    return ok(events)
  } catch (cause) {
    logger.error({ err: cause, caseId }, 'Failed to replay case audit trail')
    return err({
      code: 'AUDIT_READ_FAILED',
      message: `Failed to read audit trail for case ${caseId}`,
      cause,
    })
  }
}

/**
 * Fetch recent audit events across all cases.
 * Used for the audit explorer in the web UI.
 */
export async function getRecentEvents(
  options: { limit?: number; actorId?: string; action?: string } = {},
): Promise<Result<AuditLog[], AuditError>> {
  const { limit = 100, actorId, action } = options
  try {
    const records = await db.auditLog.findMany({
      where: {
        ...(actorId ? { actorId } : {}),
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    })

    const events: AuditLog[] = records.map((r) => ({
      logId: r.logId,
      caseId: r.caseId,
      actorType: r.actorType as AuditLog['actorType'],
      actorId: r.actorId,
      actorRole: r.actorRole as AuditLog['actorRole'],
      action: r.action,
      payloadJson: r.payloadJson as Record<string, unknown>,
      createdAt: r.createdAt,
    }))

    return ok(events)
  } catch (cause) {
    logger.error({ err: cause, options }, 'Failed to fetch recent audit events')
    return err({
      code: 'AUDIT_READ_FAILED',
      message: 'Failed to read recent audit events',
      cause,
    })
  }
}
