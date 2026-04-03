/**
 * Mistsplitter MCP Server — entry point.
 *
 * Reads config, creates AgentRegistry, creates and starts the MCP server
 * over StdioServerTransport (standard MCP protocol transport).
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { getConfig, logger } from '@mistsplitter/core'
import { createMcpServer } from './server.js'

async function main(): Promise<void> {
  // Validate configuration at startup — throws if any required env var is missing
  getConfig()

  const { server } = createMcpServer()

  const transport = new StdioServerTransport()
  await server.connect(transport)

  logger.info({ name: 'mistsplitter-mcp', version: '0.1.0' }, 'MCP server started on stdio transport')
}

main().catch((err: unknown) => {
  // Fatal startup error — log and exit non-zero
  // We use process.stderr directly since logger may not be initialized
  process.stderr.write(`MCP server failed to start: ${String(err)}\n`)
  process.exit(1)
})
