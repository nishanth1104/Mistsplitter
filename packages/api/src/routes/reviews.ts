import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db, ids } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import { requireRole } from '../middleware/auth.js'

const ReviewBodySchema = z.object({
  finalAction: z.enum(['approved', 'overridden', 'escalated', 'requested_context']),
  overrideFlag: z.boolean(),
  reasonCode: z.string().min(1).optional(),
  notes: z.string().max(2000).optional(),
})

// Map finalAction to case status
const ACTION_TO_STATUS: Record<string, 'closed_clear' | 'closed_actioned' | 'escalated' | 'in_review'> = {
  approved: 'closed_clear',
  overridden: 'closed_actioned',
  escalated: 'escalated',
  requested_context: 'in_review',
}

// Map finalAction to audit event
const ACTION_TO_AUDIT: Record<string, string> = {
  approved: AuditActions.REVIEW_SUBMITTED,
  overridden: AuditActions.REVIEW_OVERRIDDEN,
  escalated: AuditActions.REVIEW_ESCALATED,
  requested_context: AuditActions.REVIEW_SUBMITTED,
}

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  // POST /cases/:id/reviews — submit a review
  app.post(
    '/:id/reviews',
    { preHandler: requireRole('reviewer') },
    async (request, reply) => {
      const { id: caseId } = request.params as { id: string }
      const user = request.user!
      const correlationId = request.headers['x-correlation-id'] as string | undefined

      // Validate body
      const bodyResult = ReviewBodySchema.safeParse(request.body)
      if (!bodyResult.success) {
        return reply.status(400).send({
          error: 'Invalid review body',
          code: 'VALIDATION_ERROR',
          details: bodyResult.error.issues,
        })
      }
      const body = bodyResult.data

      // Override requires reason code
      if (body.finalAction === 'overridden' && !body.reasonCode) {
        return reply.status(400).send({
          error: 'overrideFlag=true requires reasonCode',
          code: 'VALIDATION_ERROR',
        })
      }

      // Fetch case
      const caseRecord = await db.case.findUnique({ where: { caseId } })
      if (!caseRecord) {
        return reply.status(404).send({ error: 'Case not found', code: 'NOT_FOUND' })
      }

      // Write review record
      const reviewId = ids.review()
      const review = await db.review.create({
        data: {
          reviewId,
          caseId,
          reviewerId: user.id,
          finalAction: body.finalAction,
          overrideFlag: body.overrideFlag,
          reasonCode: body.reasonCode ?? null,
          notes: body.notes ?? null,
          reviewedAt: new Date(),
        },
      })

      // Update case status
      const newStatus = ACTION_TO_STATUS[body.finalAction] ?? 'in_review'
      await db.case.update({
        where: { caseId },
        data: { status: newStatus },
      })

      // Write audit event
      const auditAction = ACTION_TO_AUDIT[body.finalAction] ?? AuditActions.REVIEW_SUBMITTED
      await writeAuditEvent({
        caseId,
        actorType: 'reviewer',
        actorId: user.id,
        actorRole: user.role,
        action: auditAction,
        payload: {
          reviewId,
          finalAction: body.finalAction,
          overrideFlag: body.overrideFlag,
          reasonCode: body.reasonCode,
          newStatus,
        },
        correlationId: correlationId ?? caseRecord.correlationId ?? undefined,
      })

      return reply.status(201).send({
        reviewId: review.reviewId,
        caseId,
        finalAction: review.finalAction,
        caseStatus: newStatus,
      })
    },
  )
}
