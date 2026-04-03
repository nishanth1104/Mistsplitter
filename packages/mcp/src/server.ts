/**
 * MCP Server bootstrap.
 * Creates the Server instance, attaches all tool handlers, and returns it.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { AgentRegistry } from '@mistsplitter/agents'
import { registerTools } from './tools/index.js'

export function createMcpServer(): { server: Server; registry: AgentRegistry } {
  const registry = new AgentRegistry()

  const server = new Server(
    {
      name: 'mistsplitter-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  registerTools(server, registry)

  return { server, registry }
}
