import { Command } from 'commander'
import { readFileSync } from 'fs'
import { z } from 'zod'
import { db, ids } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import { startWorkflowRun, executeWorkflow, RISK_REVIEW_STEPS, buildExecutors } from '@mistsplitter/workflow'
import { print, success, error, warn, printJson, printTable, createSpinner, isJsonMode } from '../output.js'
import chalk from 'chalk'

// Optional nested transaction payload included in fixture files
const InlineTransactionSchema = z.object({
  transactionId: z.string().min(1),
  accountId: z.string().min(1),
  merchantId: z.string().min(1).optional(),
  amount: z.string().min(1),
  currency: z.string().min(1),
  channel: z.enum(['card', 'wire', 'ach', 'cash', 'crypto']),
  timestamp: z.string().min(1),
  status: z.enum(['completed', 'pending', 'reversed', 'flagged']),
})

// Zod schema for alert file validation
const AlertFileSchema = z.object({
  alertId: z.string().min(1),
  transactionId: z.string().min(1),
  alertType: z.enum(['amount_threshold', 'velocity', 'pattern', 'merchant_risk', 'rule_hit']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  transaction: InlineTransactionSchema.optional(),
})

// Map severity to priority
function severityToPriority(severity: string): 'low' | 'medium' | 'high' | 'critical' {
  const map: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    critical: 'critical',
  }
  return map[severity] ?? 'medium'
}

// Color case status
function colorStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    pending: chalk.yellow,
    in_review: chalk.blue,
    escalated: chalk.magenta,
    closed_clear: chalk.green,
    closed_actioned: chalk.red,
  }
  return (colors[status] ?? chalk.white)(status)
}

export function registerCaseCommands(program: Command): void {
  const caseCmd = program.command('case').description('Case management commands')

  // case ingest <alert-file>
  caseCmd
    .command('ingest <alert-file>')
    .description('Ingest an alert file and create a case')
    .action(async (alertFile: string) => {
      const spinner = createSpinner('Reading alert file...')
      spinner.start()
      try {
        const raw = readFileSync(alertFile, 'utf-8')
        const parsed = JSON.parse(raw) as unknown
        const result = AlertFileSchema.safeParse(parsed)
        if (!result.success) {
          spinner.fail('Invalid alert file')
          error(result.error.message)
          process.exit(1)
        }
        const alert = result.data

        // Check for duplicate
        const existing = await db.alert.findUnique({ where: { alertId: alert.alertId } })
        if (existing) {
          spinner.warn('Alert already exists')
          const existingCase = await db.case.findFirst({ where: { alertId: alert.alertId } })
          if (existingCase) {
            warn(`Alert already ingested. Existing case: ${existingCase.caseId}`)
            if (isJsonMode(program)) printJson({ caseId: existingCase.caseId, existing: true })
          }
          return
        }

        // If the alert file embeds a transaction, upsert it (and its account) so the FK is satisfied
        if (alert.transaction) {
          const txn = alert.transaction
          spinner.text = 'Upserting transaction record...'

          // Ensure account exists (create a synthetic one if needed)
          const accountExists = await db.account.findUnique({ where: { accountId: txn.accountId } })
          if (!accountExists) {
            const custId = ids.customer()
            await db.customer.create({
              data: {
                customerId: custId,
                customerType: 'individual',
                name: 'Synthetic Customer (fixture)',
                country: 'US',
                riskTier: 'medium',
              },
            })
            await db.account.create({
              data: {
                accountId: txn.accountId,
                customerId: custId,
                status: 'active',
                openedAt: new Date(),
              },
            })
          }

          // Ensure merchant exists if referenced
          if (txn.merchantId !== undefined) {
            const merchantExists = await db.merchant.findUnique({
              where: { merchantId: txn.merchantId },
            })
            if (!merchantExists) {
              await db.merchant.create({
                data: {
                  merchantId: txn.merchantId,
                  name: 'Synthetic Merchant (fixture)',
                  category: '5999',
                  country: 'US',
                  riskTag: 'standard',
                },
              })
            }
          }

          await db.transaction.upsert({
            where: { transactionId: txn.transactionId },
            update: {},
            create: {
              transactionId: txn.transactionId,
              accountId: txn.accountId,
              ...(txn.merchantId !== undefined ? { merchantId: txn.merchantId } : {}),
              amount: txn.amount,
              currency: txn.currency,
              channel: txn.channel,
              timestamp: new Date(txn.timestamp),
              status: txn.status,
            },
          })
        }

        // Create alert
        spinner.text = 'Creating alert record...'
        await db.alert.create({
          data: {
            alertId: alert.alertId,
            transactionId: alert.transactionId,
            alertType: alert.alertType,
            severity: alert.severity,
          },
        })

        // Create case
        const caseId = ids.case()
        const correlationId = ids.correlationId()
        const priority = severityToPriority(alert.severity)
        await db.case.create({
          data: {
            caseId,
            alertId: alert.alertId,
            status: 'pending',
            priority,
            correlationId,
          },
        })

        // Audit events
        await writeAuditEvent({
          caseId,
          actorType: 'cli',
          actorId: 'cli-user',
          actorRole: 'analyst',
          action: AuditActions.ALERT_RECEIVED,
          payload: { alertId: alert.alertId, alertType: alert.alertType, severity: alert.severity },
          correlationId,
        })
        await writeAuditEvent({
          caseId,
          actorType: 'cli',
          actorId: 'cli-user',
          actorRole: 'analyst',
          action: AuditActions.CASE_CREATED,
          payload: { caseId, priority, correlationId },
          correlationId,
        })

        spinner.succeed('Case created')
        if (isJsonMode(program)) {
          printJson({ caseId, correlationId, priority, status: 'pending' })
        } else {
          success(`Case ID: ${chalk.bold(caseId)}`)
          print(`  Priority: ${priority}`)
          print(`  Correlation ID: ${correlationId}`)
        }
      } catch (err_) {
        spinner.fail('Failed to ingest alert')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // case run <case_id>
  caseCmd
    .command('run <case_id>')
    .description('Execute the risk_review workflow for a case')
    .action(async (caseId: string) => {
      const spinner = createSpinner('Starting workflow...')
      spinner.start()
      try {
        // Verify case exists
        const caseRecord = await db.case.findUnique({ where: { caseId } })
        if (!caseRecord) {
          spinner.fail('Case not found')
          error(`No case found with ID: ${caseId}`)
          process.exit(1)
        }

        const correlationId = caseRecord.correlationId ?? ids.correlationId()

        // Start the workflow run
        const runResult = await startWorkflowRun(caseId, correlationId)
        if (!runResult.ok) {
          spinner.fail('Failed to start workflow')
          error(runResult.error.message)
          process.exit(1)
        }

        const run = runResult.value
        spinner.text = `Running agents... (run: ${run.runId})`

        // Execute all pipeline steps
        const executors = buildExecutors(caseId, run.runId)
        const result = await executeWorkflow(run, RISK_REVIEW_STEPS, executors, correlationId)

        if (result.ok) {
          const finalState = result.value.state
          if (finalState === 'awaiting_review') {
            spinner.succeed('Workflow complete — awaiting human review')
            success(`Run ID: ${run.runId}`)
            print(`  Final state: ${chalk.yellow(finalState)}`)
            print('  Use `case recommendation <case_id>` to see the recommendation')
            print('  Use `review approve|override|escalate <case_id>` to submit a review')
          } else {
            spinner.succeed(`Workflow complete`)
            success(`Run ID: ${run.runId}`)
            print(`  Final state: ${chalk.green(finalState)}`)
          }

          if (isJsonMode(program)) {
            printJson({ runId: run.runId, caseId, finalState, status: result.value.status })
          }
        } else {
          spinner.fail('Workflow failed')
          error(`Error: ${result.error.message}`)
          error(`Code: ${result.error.code}`)
          process.exit(1)
        }
      } catch (err_) {
        spinner.fail('Workflow execution error')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // case show <case_id>
  caseCmd
    .command('show <case_id>')
    .description('Display case detail')
    .action(async (caseId: string) => {
      const spinner = createSpinner('Fetching case...')
      spinner.start()
      try {
        const caseRecord = await db.case.findUnique({
          where: { caseId },
          include: {
            alert: { include: { transaction: true } },
            recommendations: { orderBy: { createdAt: 'desc' }, take: 1 },
            reviews: { orderBy: { reviewedAt: 'desc' }, take: 1 },
            workflowRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
          },
        })
        if (!caseRecord) {
          spinner.fail('Case not found')
          error(`No case found with ID: ${caseId}`)
          process.exit(1)
        }
        spinner.stop()

        if (isJsonMode(program)) {
          printJson(caseRecord)
          return
        }

        const rec = caseRecord.recommendations[0]
        const rev = caseRecord.reviews[0]
        const run = caseRecord.workflowRuns[0]

        print(chalk.bold('\n── Case Detail ──────────────────────────'))
        printTable(['Field', 'Value'], [
          ['Case ID', chalk.bold(caseRecord.caseId)],
          ['Status', colorStatus(caseRecord.status)],
          ['Priority', caseRecord.priority],
          ['Alert Type', caseRecord.alert?.alertType ?? '—'],
          ['Severity', caseRecord.alert?.severity ?? '—'],
          ['Correlation ID', caseRecord.correlationId ?? '—'],
          ['Assigned To', caseRecord.assignedTo ?? '—'],
          ['Workflow State', run?.state ?? 'not started'],
          ['Recommendation', rec?.recommendedAction ?? 'none yet'],
          ['Confidence', rec?.confidence ?? '—'],
          ['Review Action', rev?.finalAction ?? 'pending'],
          ['Created', caseRecord.createdAt.toISOString()],
          ['Updated', caseRecord.updatedAt.toISOString()],
        ])

        if (rec?.summary) {
          print(chalk.bold('\nSummary:'))
          print(rec.summary)
        }
      } catch (err_) {
        spinner.fail('Error fetching case')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // case evidence <case_id>
  caseCmd
    .command('evidence <case_id>')
    .description('Show evidence bundle for a case')
    .action(async (caseId: string) => {
      const spinner = createSpinner('Fetching evidence...')
      spinner.start()
      try {
        const evidence = await db.caseEvidence.findMany({
          where: { caseId },
          orderBy: { createdAt: 'asc' },
        })
        spinner.stop()

        if (evidence.length === 0) {
          warn('No evidence records found for this case.')
          return
        }

        if (isJsonMode(program)) {
          printJson(evidence)
          return
        }

        print(chalk.bold(`\n── Evidence Bundle (${evidence.length} records) ──`))
        for (const ev of evidence) {
          print(chalk.cyan(`\n[${ev.evidenceType}] ${ev.createdAt.toISOString()}`))
          print(JSON.stringify(ev.payloadJson, null, 2))
        }
      } catch (err_) {
        spinner.fail('Error fetching evidence')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // case recommendation <case_id>
  caseCmd
    .command('recommendation <case_id>')
    .description('Show latest recommendation for a case')
    .action(async (caseId: string) => {
      const spinner = createSpinner('Fetching recommendation...')
      spinner.start()
      try {
        const rec = await db.recommendation.findFirst({
          where: { caseId },
          orderBy: { createdAt: 'desc' },
        })
        spinner.stop()

        if (!rec) {
          warn('No recommendation found. Run the workflow first.')
          return
        }

        if (isJsonMode(program)) {
          printJson(rec)
          return
        }

        const actionColor =
          rec.recommendedAction === 'clear'
            ? chalk.green
            : rec.recommendedAction === 'escalate'
              ? chalk.red
              : chalk.yellow

        print(chalk.bold('\n── Recommendation ───────────────────────'))
        printTable(['Field', 'Value'], [
          ['Action', actionColor(rec.recommendedAction)],
          ['Confidence', rec.confidence],
          ['Generated', rec.createdAt.toISOString()],
        ])
        print(chalk.bold('\nSummary:'))
        print(rec.summary)
        if (rec.evidenceReferences.length > 0) {
          print(chalk.bold('\nEvidence References:'))
          for (const ref of rec.evidenceReferences) print(`  • ${ref}`)
        }
      } catch (err_) {
        spinner.fail('Error fetching recommendation')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // case audit <case_id>
  caseCmd
    .command('audit <case_id>')
    .description('Show audit trail for a case')
    .action(async (caseId: string) => {
      const spinner = createSpinner('Fetching audit trail...')
      spinner.start()
      try {
        const logs = await db.auditLog.findMany({
          where: { caseId },
          orderBy: { createdAt: 'asc' },
        })
        spinner.stop()

        if (logs.length === 0) {
          warn('No audit events found for this case.')
          return
        }

        if (isJsonMode(program)) {
          printJson(logs)
          return
        }

        print(chalk.bold(`\n── Audit Trail (${logs.length} events) ──────────`))
        printTable(
          ['Time', 'Actor', 'Role', 'Action', 'Payload'],
          logs.map(l => [
            l.createdAt.toISOString().replace('T', ' ').slice(0, 19),
            l.actorId,
            l.actorRole,
            chalk.cyan(l.action),
            JSON.stringify(l.payloadJson).slice(0, 60),
          ]),
        )
      } catch (err_) {
        spinner.fail('Error fetching audit trail')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })
}
