import { Command } from 'commander'
import { db } from '@mistsplitter/core'
import { replayCase } from '@mistsplitter/audit'
import { print, error, warn, printJson, printTable, createSpinner, isJsonMode } from '../output.js'
import chalk from 'chalk'

export function registerReplayCommands(program: Command): void {
  const replayCmd = program.command('replay').description('Replay and compare workflow runs')

  // replay case <case_id>
  replayCmd
    .command('case <case_id>')
    .description('Replay audit timeline for a case')
    .action(async (caseId: string) => {
      const spinner = createSpinner('Replaying workflow...')
      spinner.start()
      try {
        const result = await replayCase(caseId)
        spinner.stop()

        if (!result.ok) {
          error(`Replay failed: ${result.error.message}`)
          process.exit(1)
        }

        const events = result.value
        if (events.length === 0) {
          warn('No audit events found for this case.')
          return
        }

        if (isJsonMode(program)) {
          printJson(events)
          return
        }

        print(chalk.bold(`\n── Replaying Case ${caseId} (${events.length} events) ──`))
        printTable(
          ['#', 'Time', 'Actor', 'Action', 'Payload'],
          events.map((e, i) => [
            String(i + 1),
            e.createdAt.toISOString().replace('T', ' ').slice(0, 19),
            `${e.actorId} (${e.actorRole})`,
            chalk.cyan(e.action),
            JSON.stringify(e.payloadJson).slice(0, 60),
          ]),
        )
      } catch (err_) {
        spinner.fail('Replay failed')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })

  // replay compare <run_id_a> <run_id_b>
  replayCmd
    .command('compare <run_id_a> <run_id_b>')
    .description('Compare two workflow runs side by side')
    .action(async (runIdA: string, runIdB: string) => {
      const spinner = createSpinner('Loading runs...')
      spinner.start()
      try {
        const [runA, runB] = await Promise.all([
          db.workflowRun.findUnique({ where: { runId: runIdA } }),
          db.workflowRun.findUnique({ where: { runId: runIdB } }),
        ])

        if (!runA || !runB) {
          spinner.fail('Run not found')
          if (!runA) error(`Run not found: ${runIdA}`)
          if (!runB) error(`Run not found: ${runIdB}`)
          process.exit(1)
        }

        const [eventsA, eventsB] = await Promise.all([
          replayCase(runA.caseId),
          replayCase(runB.caseId),
        ])
        spinner.stop()

        if (!eventsA.ok || !eventsB.ok) {
          error('Failed to load audit events for comparison')
          process.exit(1)
        }

        if (isJsonMode(program)) {
          printJson({ runA: eventsA.value, runB: eventsB.value })
          return
        }

        // Build action → timestamp maps for each run
        const mapA = new Map(eventsA.value.map(e => [e.action, e.createdAt.toISOString()]))
        const mapB = new Map(eventsB.value.map(e => [e.action, e.createdAt.toISOString()]))
        const allActions = [...new Set([...mapA.keys(), ...mapB.keys()])]

        print(chalk.bold(`\n── Run Comparison ───────────────────────`))
        print(`Run A: ${runIdA} (case: ${runA.caseId})`)
        print(`Run B: ${runIdB} (case: ${runB.caseId})`)
        printTable(
          ['Action', 'Run A Time', 'Run B Time'],
          allActions.map(action => [
            chalk.cyan(action),
            mapA.get(action) ?? chalk.dim('—'),
            mapB.get(action) ?? chalk.dim('—'),
          ]),
        )
      } catch (err_) {
        spinner.fail('Comparison failed')
        error(err_ instanceof Error ? err_.message : String(err_))
        process.exit(1)
      }
    })
}
