import { Command } from 'commander'
import { db, ids } from '@mistsplitter/core'
import { print, success, error, createSpinner } from '../output.js'

export function registerSeedCommands(program: Command): void {
  const seedCmd = program.command('seed').description('Seed synthetic data')

  seedCmd
    .command('data')
    .description('Show current DB record counts (run pnpm db:seed for full seed)')
    .action(async () => {
      const spinner = createSpinner('Counting records...')
      spinner.start()
      try {
        const counts = {
          customers: await db.customer.count(),
          accounts: await db.account.count(),
          transactions: await db.transaction.count(),
          merchants: await db.merchant.count(),
          alerts: await db.alert.count(),
          cases: await db.case.count(),
          agents: await db.agentRegistry.count(),
          auditLogs: await db.auditLog.count(),
          workflowRuns: await db.workflowRun.count(),
        }
        spinner.succeed('Current DB record counts:')
        for (const [table, count] of Object.entries(counts)) {
          print(`  ${table}: ${count}`)
        }
        print('\nTo seed the full dataset, run: pnpm db:seed')
      } catch (err_) {
        spinner.fail('Failed to count records')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  seedCmd
    .command('alerts')
    .description('Seed demo alerts from existing transactions')
    .action(async () => {
      const spinner = createSpinner('Seeding alerts...')
      spinner.start()
      try {
        // Pick transactions that don't have alerts yet
        const txns = await db.transaction.findMany({
          take: 20,
          orderBy: { createdAt: 'desc' },
          where: { alerts: { none: {} } },
        })
        const sample = txns.slice(0, 5)
        let created = 0
        for (const txn of sample) {
          await db.alert.create({
            data: {
              alertId: ids.alert(),
              transactionId: txn.transactionId,
              alertType: 'amount_threshold',
              severity: 'medium',
            },
          })
          created++
        }
        spinner.succeed(`Created ${created} demo alerts`)
        if (created === 0) {
          print('No eligible transactions found. All transactions may already have alerts.')
        }
      } catch (err_) {
        spinner.fail('Failed to seed alerts')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  seedCmd
    .command('history')
    .description('Seed reviewer history (up to 10 reviews across pending/in_review cases)')
    .action(async () => {
      const spinner = createSpinner('Seeding reviewer history...')
      spinner.start()
      try {
        const cases = await db.case.findMany({
          where: { status: { in: ['pending', 'in_review'] } },
          take: 10,
          orderBy: { createdAt: 'desc' },
        })
        let created = 0
        const actions = [
          'approved',
          'approved',
          'overridden',
          'approved',
          'escalated',
          'approved',
          'approved',
          'overridden',
          'approved',
          'approved',
        ] as const
        for (let i = 0; i < Math.min(cases.length, 10); i++) {
          const c = cases[i]
          if (!c) continue
          const action = actions[i] ?? 'approved'
          await db.review.create({
            data: {
              reviewId: ids.review(),
              caseId: c.caseId,
              reviewerId: 'seed-reviewer',
              finalAction: action,
              overrideFlag: action === 'overridden',
              ...(action === 'overridden' ? { reasonCode: 'KNOWN_PATTERN' } : {}),
              reviewedAt: new Date(),
            },
          })
          await db.case.update({
            where: { caseId: c.caseId },
            data: {
              status:
                action === 'approved'
                  ? 'closed_clear'
                  : action === 'overridden'
                    ? 'closed_actioned'
                    : 'escalated',
            },
          })
          created++
        }
        spinner.succeed(`Created ${created} reviewer history records`)
        if (created === 0) {
          print('No pending/in_review cases found to seed history for.')
        }
      } catch (err_) {
        spinner.fail('Failed to seed history')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })
}
