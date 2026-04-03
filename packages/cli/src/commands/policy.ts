import { Command } from 'commander'
import { db } from '@mistsplitter/core'
import { evaluatePolicy } from '@mistsplitter/policy'
import { print, error, warn, printJson, printTable, createSpinner, isJsonMode } from '../output.js'
import chalk from 'chalk'

const SIMULATE_SCENARIOS = {
  'high-amount': {
    caseStatus: 'in_review' as const,
    casePriority: 'high' as const,
    recommendedAction: 'review_further' as const,
  },
  'pep-customer': {
    caseStatus: 'in_review' as const,
    casePriority: 'critical' as const,
    recommendedAction: 'escalate' as const,
  },
  'rapid-succession': {
    caseStatus: 'pending' as const,
    casePriority: 'medium' as const,
    recommendedAction: 'review_further' as const,
  },
  escalation: {
    caseStatus: 'escalated' as const,
    casePriority: 'critical' as const,
    recommendedAction: 'escalate' as const,
  },
}

function colorDecision(decision: string): string {
  if (decision === 'permitted') return chalk.green(decision)
  if (decision === 'blocked') return chalk.red(decision)
  return chalk.yellow(decision)
}

export function registerPolicyCommands(program: Command): void {
  const policyCmd = program.command('policy').description('Policy evaluation commands')

  // policy check <case_id>
  policyCmd
    .command('check <case_id>')
    .description('Evaluate policy for a case (dry-run)')
    .action(async (caseId: string) => {
      const spinner = createSpinner('Evaluating policy...')
      spinner.start()
      try {
        const caseRecord = await db.case.findUnique({ where: { caseId } })
        if (!caseRecord) {
          spinner.fail('Case not found')
          error(`No case: ${caseId}`)
          process.exit(1)
        }

        const result = await evaluatePolicy({
          caseId,
          agentId: 'cli-user',
          workflowName: 'risk_review',
          caseStatus: caseRecord.status,
          casePriority: caseRecord.priority,
          dryRun: true,
        })
        spinner.stop()

        if (!result.ok) {
          error(`Policy evaluation failed: ${result.error.message}`)
          process.exit(1)
        }

        const decision = result.value
        if (isJsonMode(program)) {
          printJson(decision)
          return
        }

        print(chalk.bold('\n── Policy Check (dry-run) ───────────────'))
        printTable(['Field', 'Value'], [
          ['Decision', colorDecision(decision.decision)],
          ['Rationale', decision.rationale],
          ['Requires Approval From', decision.requiresApprovalFrom?.join(', ') ?? '—'],
          ['Blocked By', decision.blockedBy ?? '—'],
        ])
      } catch (err_) {
        spinner.fail('Policy check failed')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // policy simulate <scenario>
  policyCmd
    .command('simulate <scenario>')
    .description(`Simulate a policy scenario (${Object.keys(SIMULATE_SCENARIOS).join('|')})`)
    .action(async (scenario: string) => {
      const ctx = SIMULATE_SCENARIOS[scenario as keyof typeof SIMULATE_SCENARIOS]
      if (!ctx) {
        error(
          `Unknown scenario: ${scenario}. Available: ${Object.keys(SIMULATE_SCENARIOS).join(', ')}`,
        )
        process.exit(1)
      }

      const spinner = createSpinner(`Simulating scenario: ${scenario}...`)
      spinner.start()
      try {
        const result = await evaluatePolicy({
          caseId: 'sim_case',
          agentId: 'cli-user',
          workflowName: 'risk_review',
          caseStatus: ctx.caseStatus,
          casePriority: ctx.casePriority,
          recommendedAction: ctx.recommendedAction,
          dryRun: true,
        })
        spinner.stop()

        if (!result.ok) {
          error(`Policy simulation failed: ${result.error.message}`)
          process.exit(1)
        }

        const decision = result.value
        if (isJsonMode(program)) {
          printJson({ scenario, ...decision })
          return
        }

        print(chalk.bold(`\n── Policy Simulation: ${scenario} ──`))
        printTable(['Field', 'Value'], [
          ['Scenario', scenario],
          ['Input Status', ctx.caseStatus],
          ['Input Priority', ctx.casePriority],
          ['Proposed Action', ctx.recommendedAction],
          ['Decision', colorDecision(decision.decision)],
          ['Rationale', decision.rationale],
        ])
      } catch (err_) {
        spinner.fail('Simulation failed')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // policy explain <policy_event_id>
  policyCmd
    .command('explain <policy_event_id>')
    .description('Explain a policy decision by event ID')
    .action(async (policyEventId: string) => {
      const spinner = createSpinner('Fetching policy event...')
      spinner.start()
      try {
        const event = await db.policyEvent.findUnique({ where: { policyEventId } })
        if (!event) {
          spinner.fail('Policy event not found')
          error(`No policy event: ${policyEventId}`)
          process.exit(1)
        }
        spinner.stop()

        if (isJsonMode(program)) {
          printJson(event)
          return
        }

        print(chalk.bold('\n── Policy Decision ──────────────────────'))
        printTable(['Field', 'Value'], [
          ['Event ID', event.policyEventId],
          ['Case ID', event.caseId ?? '—'],
          ['Agent ID', event.agentId ?? '—'],
          ['Decision', colorDecision(event.decision)],
          ['Rationale', event.rationale],
          ['Created', event.createdAt.toISOString()],
        ])
      } catch (err_) {
        spinner.fail('Error fetching policy event')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // Silence unused import warning
  void warn
}
