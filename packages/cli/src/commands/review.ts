import { Command } from 'commander'
import { db, ids } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import { success, error, printJson, isJsonMode, createSpinner } from '../output.js'

const CLI_ACTOR = {
  actorType: 'cli' as const,
  actorId: 'cli-user',
  actorRole: 'reviewer' as const,
}

export function registerReviewCommands(program: Command): void {
  const reviewCmd = program.command('review').description('Review management commands')

  // review approve <case_id>
  reviewCmd
    .command('approve <case_id>')
    .description('Approve the recommendation for a case')
    .action(async (caseId: string) => {
      const spinner = createSpinner('Approving case...')
      spinner.start()
      try {
        const caseRecord = await db.case.findUnique({ where: { caseId } })
        if (!caseRecord) {
          spinner.fail('Case not found')
          error(`No case: ${caseId}`)
          process.exit(1)
        }

        const reviewId = ids.review()
        await db.review.create({
          data: {
            reviewId,
            caseId,
            reviewerId: 'cli-user',
            finalAction: 'approved',
            overrideFlag: false,
            reviewedAt: new Date(),
          },
        })
        await db.case.update({ where: { caseId }, data: { status: 'closed_clear' } })
        await writeAuditEvent({
          caseId,
          ...CLI_ACTOR,
          action: AuditActions.REVIEW_SUBMITTED,
          payload: { reviewId, finalAction: 'approved' },
          correlationId: caseRecord.correlationId,
        })

        spinner.succeed('Case approved')
        if (isJsonMode(program)) printJson({ reviewId, caseId, finalAction: 'approved' })
        else success(`Case ${caseId} approved and closed_clear.`)
      } catch (err_) {
        spinner.fail('Failed to approve case')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // review override <case_id> --reason-code <code>
  reviewCmd
    .command('override <case_id>')
    .description('Override the recommendation (requires --reason-code)')
    .requiredOption('--reason-code <code>', 'Reason code for override')
    .option('--notes <text>', 'Additional notes')
    .action(async (caseId: string, opts: { reasonCode: string; notes?: string }) => {
      const spinner = createSpinner('Overriding case...')
      spinner.start()
      try {
        const caseRecord = await db.case.findUnique({ where: { caseId } })
        if (!caseRecord) {
          spinner.fail('Case not found')
          error(`No case: ${caseId}`)
          process.exit(1)
        }

        const reviewId = ids.review()
        await db.review.create({
          data: {
            reviewId,
            caseId,
            reviewerId: 'cli-user',
            finalAction: 'overridden',
            overrideFlag: true,
            reasonCode: opts.reasonCode,
            ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
            reviewedAt: new Date(),
          },
        })
        await db.case.update({ where: { caseId }, data: { status: 'closed_actioned' } })
        await writeAuditEvent({
          caseId,
          ...CLI_ACTOR,
          action: AuditActions.REVIEW_OVERRIDDEN,
          payload: { reviewId, finalAction: 'overridden', reasonCode: opts.reasonCode },
          correlationId: caseRecord.correlationId,
        })

        spinner.succeed('Case overridden')
        if (isJsonMode(program))
          printJson({ reviewId, caseId, finalAction: 'overridden', reasonCode: opts.reasonCode })
        else success(`Case ${caseId} overridden → closed_actioned. Reason: ${opts.reasonCode}`)
      } catch (err_) {
        spinner.fail('Failed to override case')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // review escalate <case_id>
  reviewCmd
    .command('escalate <case_id>')
    .description('Escalate a case')
    .option('--notes <text>', 'Escalation notes')
    .action(async (caseId: string, opts: { notes?: string }) => {
      const spinner = createSpinner('Escalating case...')
      spinner.start()
      try {
        const caseRecord = await db.case.findUnique({ where: { caseId } })
        if (!caseRecord) {
          spinner.fail('Case not found')
          error(`No case: ${caseId}`)
          process.exit(1)
        }

        const reviewId = ids.review()
        await db.review.create({
          data: {
            reviewId,
            caseId,
            reviewerId: 'cli-user',
            finalAction: 'escalated',
            overrideFlag: false,
            ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
            reviewedAt: new Date(),
          },
        })
        await db.case.update({ where: { caseId }, data: { status: 'escalated' } })
        await writeAuditEvent({
          caseId,
          ...CLI_ACTOR,
          action: AuditActions.REVIEW_ESCALATED,
          payload: { reviewId, finalAction: 'escalated' },
          correlationId: caseRecord.correlationId,
        })

        spinner.succeed('Case escalated')
        if (isJsonMode(program)) printJson({ reviewId, caseId, finalAction: 'escalated' })
        else success(`Case ${caseId} escalated.`)
      } catch (err_) {
        spinner.fail('Failed to escalate case')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // review note <case_id> <text>
  reviewCmd
    .command('note <case_id> <text>')
    .description('Add an annotation to a case (audit-only)')
    .action(async (caseId: string, text: string) => {
      try {
        const caseRecord = await db.case.findUnique({ where: { caseId } })
        if (!caseRecord) {
          error(`No case: ${caseId}`)
          process.exit(1)
        }
        await writeAuditEvent({
          caseId,
          ...CLI_ACTOR,
          action: 'case.annotated',
          payload: { note: text },
          correlationId: caseRecord.correlationId,
        })
        success(`Note added to audit trail for case ${caseId}.`)
      } catch (err_) {
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })
}
