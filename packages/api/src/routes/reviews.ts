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

// Cases that are already closed — cannot be re-reviewed
const CLOSED_STATUSES = new Set(['closed_clear', 'closed_actioned'])

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  // POST /cases/:id/reviews — submit a review
  app.post(
    '/:id/reviews',
    {
      preHandler: [
        requireRole('reviewer'),
        // Tighter rate limit for review submission (10 req/min)
        async (request, reply) => {
          void request
          void reply
        },
      ],
    },
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

      // 409: Reject review on already-closed cases
      if (CLOSED_STATUSES.has(caseRecord.status)) {
        return reply.status(409).send({
          error: `Case ${caseId} is already ${caseRecord.status} and cannot be re-reviewed`,
          code: 'CASE_ALREADY_CLOSED',
        })
      }

      // Idempotency: if same reviewer submitted a review for this case within 60s, return existing
      const sixtySecondsAgo = new Date(Date.now() - 60_000)
      const existingReview = await db.review.findFirst({
        where: {
          caseId,
          reviewerId: user.id,
          reviewedAt: { gte: sixtySecondsAgo },
        },
        orderBy: { reviewedAt: 'desc' },
      })
      if (existingReview) {
        return reply.status(200).send({
          reviewId: existingReview.reviewId,
          caseId,
          finalAction: existingReview.finalAction,
          caseStatus: caseRecord.status,
          idempotent: true,
        })
      }

      // Atomic: write review + update case status in a single transaction
      const reviewId = ids.review()
      const newStatus = ACTION_TO_STATUS[body.finalAction] ?? 'in_review'

      const review = await db.$transaction(async (tx) => {
        const created = await tx.review.create({
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

        await tx.case.update({
          where: { caseId },
          data: { status: newStatus },
        })

        return created
      })

      // Write audit event after transaction commits (intentionally outside transaction)
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
