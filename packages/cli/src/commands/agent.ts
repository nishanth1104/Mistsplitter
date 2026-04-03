import { Command } from 'commander'
import { createInterface } from 'readline'
import { db } from '@mistsplitter/core'
import { writeAuditEvent } from '@mistsplitter/audit'
import { print, success, error, warn, printJson, printTable, createSpinner, isJsonMode } from '../output.js'
import chalk from 'chalk'

function colorAgentStatus(status: string): string {
  if (status === 'active') return chalk.green(status)
  if (status === 'suspended') return chalk.yellow(status)
  return chalk.red(status)
}

async function confirmRevoke(agentName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`Type the agent name to confirm revocation (${chalk.bold(agentName)}): `, (answer) => {
      rl.close()
      resolve(answer.trim() === agentName)
    })
  })
}

export function registerAgentCommands(program: Command): void {
  const agentCmd = program.command('agent').description('Agent management commands')

  // agent list
  agentCmd
    .command('list')
    .description('List all registered agents')
    .action(async () => {
      const spinner = createSpinner('Fetching agents...')
      spinner.start()
      try {
        const agents = await db.agentRegistry.findMany({ orderBy: { name: 'asc' } })
        spinner.stop()

        if (isJsonMode(program)) {
          printJson(agents)
          return
        }

        print(chalk.bold(`\n── Agent Registry (${agents.length} agents) ──`))
        printTable(
          ['Name', 'Role', 'Status', 'Risk', 'Tools', 'Created'],
          agents.map(a => [
            chalk.bold(a.name),
            a.role,
            colorAgentStatus(a.status),
            a.riskLevel,
            String(a.approvedTools.length),
            a.createdAt.toISOString().slice(0, 10),
          ]),
        )
      } catch (err_) {
        spinner.fail('Failed to list agents')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // agent show <agent_id>
  agentCmd
    .command('show <agent_id>')
    .description('Show agent detail')
    .action(async (agentId: string) => {
      const spinner = createSpinner('Fetching agent...')
      spinner.start()
      try {
        let agent = await db.agentRegistry.findUnique({ where: { agentId } })
        if (!agent) agent = await db.agentRegistry.findFirst({ where: { name: agentId } })
        if (!agent) {
          spinner.fail('Agent not found')
          error(`No agent found: ${agentId}`)
          process.exit(1)
        }
        spinner.stop()

        if (isJsonMode(program)) {
          printJson(agent)
          return
        }

        print(chalk.bold('\n── Agent Detail ─────────────────────────'))
        printTable(['Field', 'Value'], [
          ['Agent ID', agent.agentId],
          ['Name', chalk.bold(agent.name)],
          ['Owner', agent.owner],
          ['Role', agent.role],
          ['Status', colorAgentStatus(agent.status)],
          ['Risk Level', agent.riskLevel],
          ['Created', agent.createdAt.toISOString()],
        ])
        print(chalk.bold('\nApproved Tools:'))
        for (const t of agent.approvedTools) print(`  • ${t}`)
        print(chalk.bold('\nAllowed Actions:'))
        for (const a of agent.allowedActions) print(`  • ${a}`)
      } catch (err_) {
        spinner.fail('Error fetching agent')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // agent suspend <agent_id> --reason <text>
  agentCmd
    .command('suspend <agent_id>')
    .description('Suspend an agent')
    .requiredOption('--reason <text>', 'Reason for suspension')
    .action(async (agentId: string, opts: { reason: string }) => {
      const spinner = createSpinner('Suspending agent...')
      spinner.start()
      try {
        const agent = await db.agentRegistry.findUnique({ where: { agentId } })
        if (!agent) {
          spinner.fail('Agent not found')
          error(`No agent: ${agentId}`)
          process.exit(1)
        }
        if (agent.status !== 'active') {
          spinner.warn('Agent is not active')
          warn(`Agent ${agent.name} is already ${agent.status}`)
          return
        }

        await db.agentRegistry.update({ where: { agentId }, data: { status: 'suspended' } })
        await writeAuditEvent({
          caseId: null,
          actorType: 'cli',
          actorId: 'cli-user',
          actorRole: 'admin',
          action: 'agent.suspended',
          payload: { agentId, agentName: agent.name, reason: opts.reason },
        })

        spinner.succeed('Agent suspended')
        success(`Agent ${agent.name} suspended.`)
      } catch (err_) {
        spinner.fail('Failed to suspend agent')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // agent revoke <agent_id> --reason <text>
  agentCmd
    .command('revoke <agent_id>')
    .description('Revoke an agent (irreversible)')
    .requiredOption('--reason <text>', 'Reason for revocation')
    .action(async (agentId: string, opts: { reason: string }) => {
      const spinner = createSpinner('Fetching agent...')
      spinner.start()
      try {
        const agent = await db.agentRegistry.findUnique({ where: { agentId } })
        if (!agent) {
          spinner.fail('Agent not found')
          error(`No agent: ${agentId}`)
          process.exit(1)
        }
        if (agent.status === 'revoked') {
          spinner.warn('Already revoked')
          warn(`Agent ${agent.name} is already revoked.`)
          return
        }
        spinner.stop()

        warn('This action is IRREVERSIBLE.')
        const confirmed = await confirmRevoke(agent.name)
        if (!confirmed) {
          warn('Revocation aborted — name did not match.')
          return
        }

        const spin2 = createSpinner('Revoking agent...')
        spin2.start()
        await db.agentRegistry.update({ where: { agentId }, data: { status: 'revoked' } })
        await writeAuditEvent({
          caseId: null,
          actorType: 'cli',
          actorId: 'cli-user',
          actorRole: 'admin',
          action: 'agent.revoked',
          payload: { agentId, agentName: agent.name, reason: opts.reason },
        })
        spin2.succeed('Agent revoked')
        success(`Agent ${agent.name} revoked. This action is irreversible.`)
      } catch (err_) {
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })
}
