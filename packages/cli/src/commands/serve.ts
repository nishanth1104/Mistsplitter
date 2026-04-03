import { Command } from 'commander'
import { spawn } from 'child_process'
import { resolve } from 'path'
import { print, success, error } from '../output.js'
import chalk from 'chalk'

function spawnService(label: string, pkg: string): void {
  const child = spawn('pnpm', ['--filter', pkg, 'exec', 'tsx', 'src/index.ts'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env },
    shell: true,
  })

  child.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`${chalk.dim(`[${label}]`)} ${data.toString()}`)
  })
  child.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`${chalk.dim(`[${label}]`)} ${data.toString()}`)
  })
  child.on('exit', (code) => {
    if (code !== 0) error(`${label} exited with code ${String(code)}`)
  })
}

export function registerServeCommands(program: Command): void {
  // Resolve repo root from process.cwd() or __dirname fallback
  const repoRoot = resolve(process.cwd())

  const serveCmd = program.command('serve').description('Start platform services')

  serveCmd
    .command('api')
    .description('Start the API server')
    .action(() => {
      print(`Starting API server... (repo root: ${repoRoot})`)
      spawnService('api', '@mistsplitter/api')
    })

  serveCmd
    .command('mcp')
    .description('Start the MCP server')
    .action(() => {
      print(`Starting MCP server...`)
      spawnService('mcp', '@mistsplitter/mcp')
    })

  serveCmd
    .command('all')
    .description('Start all services')
    .action(() => {
      print(`Starting all services...`)
      spawnService('api', '@mistsplitter/api')
      spawnService('mcp', '@mistsplitter/mcp')
      success('All services started. Press Ctrl+C to stop.')
    })
}
