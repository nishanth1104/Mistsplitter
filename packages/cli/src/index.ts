#!/usr/bin/env node
import { Command } from 'commander'
import { registerCaseCommands } from './commands/case.js'
import { registerReviewCommands } from './commands/review.js'
import { registerAgentCommands } from './commands/agent.js'
import { registerPolicyCommands } from './commands/policy.js'
import { registerReplayCommands } from './commands/replay.js'
import { registerServeCommands } from './commands/serve.js'
import { registerSeedCommands } from './commands/seed.js'

const program = new Command()

program
  .name('mistsplitter')
  .description('Mistsplitter — Governed AI fintech operations platform')
  .version('0.0.1')
  .option('--json', 'Output as JSON')

registerCaseCommands(program)
registerReviewCommands(program)
registerAgentCommands(program)
registerPolicyCommands(program)
registerReplayCommands(program)
registerServeCommands(program)
registerSeedCommands(program)

program.parse(process.argv)
