import chalk from 'chalk'
import Table from 'cli-table3'
import ora from 'ora'
import type { Ora } from 'ora'

export { Ora }

export function print(text: string): void {
  process.stdout.write(text + '\n')
}

export function success(text: string): void {
  process.stdout.write(chalk.green('✓ ') + text + '\n')
}

export function error(text: string): void {
  process.stderr.write(chalk.red('✗ ') + text + '\n')
}

export function warn(text: string): void {
  process.stdout.write(chalk.yellow('⚠ ') + text + '\n')
}

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

export function printTable(headers: string[], rows: string[][]): void {
  const table = new Table({ head: headers.map(h => chalk.cyan(h)) })
  for (const row of rows) table.push(row)
  process.stdout.write(table.toString() + '\n')
}

export function createSpinner(text: string): Ora {
  return ora(text)
}

export function isJsonMode(program: { opts(): { json?: boolean } }): boolean {
  return program.opts().json === true
}
