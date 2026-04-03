import chalk from 'chalk'

const C = {
  smoky:    '#462C55',
  royal:    '#704786',
  amethyst: '#8D5FA5',
  lavender: '#A977BF',
  pale:     '#E3C4E9',
}

// "MISTSPLITTER" — figlet Big font, pre-generated
const ART = [
  '  __  __ _____  _____ _______ _____ _____  _      _____ _______ _______ ______ _____  ',
  ' |  \\/  |_   _|/ ____|__   __/ ____|  __ \\| |    |_   _|__   __|__   __|  ____|  __ \\ ',
  ' | \\  / | | | | (___    | | | (___ | |__) | |      | |    | |     | |  | |__  | |__) |',
  ' | |\\/| | | |  \\___ \\   | |  \\___ \\|  ___/| |      | |    | |     | |  |  __| |  _  / ',
  ' | |  | |_| |_ ____) |  | |  ____) | |    | |____ _| |_   | |     | |  | |____| | \\ \\ ',
  ' |_|  |_|_____|_____/   |_| |_____/|_|    |______|_____|  |_|     |_|  |______|_|  \\_\\',
]

const GRADIENT = [
  C.smoky,
  C.royal,
  C.amethyst,
  C.lavender,
  C.amethyst,
  C.royal,
]

const SUBTITLE = ' Governed AI orchestration · Fintech Operations · MCP-Native '
const INNER_W = 90

export function showBanner(): void {
  const b = (s: string) => chalk.hex(C.royal)(s)
  const pad = ' '

  console.log()

  // Top border with version on the right
  const VERSION = ' v0.0.1 '
  const topDashes = INNER_W - VERSION.length - 3
  console.log(
    pad +
    b('┌') +
    b('─'.repeat(topDashes)) +
    chalk.hex(C.pale)(VERSION) +
    b('─'.repeat(3)) +
    b('┐'),
  )
  console.log(pad + b('│') + ' '.repeat(INNER_W) + b('│'))

  // ASCII art lines inside box
  for (let i = 0; i < ART.length; i++) {
    const line = chalk.hex(GRADIENT[i] ?? C.amethyst)(ART[i]!.padEnd(INNER_W))
    console.log(pad + b('│') + line + b('│'))
  }

  console.log(pad + b('│') + ' '.repeat(INNER_W) + b('│'))

  // Bottom border with subtitle embedded
  const remainingDashes = INNER_W - SUBTITLE.length - 3
  console.log(
    pad +
    b('└') +
    b('─'.repeat(3)) +
    chalk.hex(C.pale)(SUBTITLE) +
    b('─'.repeat(remainingDashes)) +
    b('┘'),
  )

  console.log()

  // Stats row
  const dot = chalk.hex(C.smoky)(' · ')
  console.log(
    '  ' +
      chalk.hex(C.lavender).bold('7') + chalk.hex(C.amethyst)(' agents') + dot +
      chalk.hex(C.lavender).bold('18') + chalk.hex(C.amethyst)(' MCP tools') + dot +
      chalk.hex(C.lavender).bold('15') + chalk.hex(C.amethyst)(' DB tables') + dot +
      chalk.hex(C.pale)('v0.0.1'),
  )

  console.log()
  console.log(chalk.hex(C.smoky)('  ' + '─'.repeat(72)))
  console.log()

  // Commands
  const commands: [string, string][] = [
    ['case',   'Ingest alerts, run workflows, inspect cases'],
    ['review', 'Approve, override, escalate, annotate'],
    ['agent',  'Manage the agent registry'],
    ['policy', 'Evaluate, simulate, and explain policy decisions'],
    ['replay', 'Audit trail replay and run comparisons'],
    ['serve',  'Start API, MCP, or all services'],
    ['seed',   'Seed synthetic fintech data'],
  ]

  for (const [cmd, desc] of commands) {
    console.log(
      '  ' +
        chalk.hex(C.lavender).bold(cmd.padEnd(10)) +
        chalk.hex(C.pale)(desc),
    )
  }

  console.log()
  console.log(
    '  ' +
      chalk.hex(C.smoky)('Run ') +
      chalk.hex(C.amethyst)('mistsplitter <command> --help') +
      chalk.hex(C.smoky)(' for usage details'),
  )
  console.log()
}
