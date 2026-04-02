#!/usr/bin/env node
import { Command } from 'commander'

const program = new Command()

program
  .name('mistsplitter')
  .description('Mistsplitter — Governed AI fintech operations platform')
  .version('0.0.1')
  .option('--json', 'Output as JSON')

// Command groups will be registered here in Phase 3
// case, review, agent, policy, replay, serve, seed

program.parse(process.argv)
