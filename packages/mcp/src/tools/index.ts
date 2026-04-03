/**
 * MCP Tool Registry — single dispatch handler for all 18 tools.
 *
 * Registers:
 * - ListToolsRequestSchema → returns all tool definitions
 * - CallToolRequestSchema → dispatches to per-tool handler by name
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js'
import type { AgentRegistry } from '@mistsplitter/agents'
import type { McpToolResponse } from '../types.js'

// Read tools
import { handleGetCase } from './read/get-case.js'
import { handleGetAlert } from './read/get-alert.js'
import { handleGetCustomerProfile } from './read/get-customer-profile.js'
import { handleGetAccountContext } from './read/get-account-context.js'
import { handleGetMerchantContext } from './read/get-merchant-context.js'
import { handleGetRecentTransactions } from './read/get-recent-transactions.js'
import { handleGetPriorAlerts } from './read/get-prior-alerts.js'
import { handleGetPriorReviews } from './read/get-prior-reviews.js'
import { handleGetCaseAudit } from './read/get-case-audit.js'

// Compute tools
import { handleComputeRuleHits } from './compute/compute-rule-hits.js'
import { handleComputeRiskSignals } from './compute/compute-risk-signals.js'
import { handleBuildEvidenceBundle } from './compute/build-evidence-bundle.js'
import { handleDraftCaseSummary } from './compute/draft-case-summary.js'
import { handleCheckPolicy } from './compute/check-policy.js'

// Action tools
import { handleSubmitReview } from './action/submit-review.js'
import { handleRequestEscalation } from './action/request-escalation.js'
import { handleSuspendAgent } from './action/suspend-agent.js'
import { handleRevokeAgent } from './action/revoke-agent.js'

type ToolHandler = (params: Record<string, unknown>, registry: AgentRegistry) => Promise<McpToolResponse>

function toCallToolResult(response: McpToolResponse): CallToolResult {
  return {
    content: response.content,
    ...(response.isError !== undefined ? { isError: response.isError } : {}),
  }
}

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // Read
  get_case: handleGetCase,
  get_alert: handleGetAlert,
  get_customer_profile: handleGetCustomerProfile,
  get_account_context: handleGetAccountContext,
  get_merchant_context: handleGetMerchantContext,
  get_recent_transactions: handleGetRecentTransactions,
  get_prior_alerts: handleGetPriorAlerts,
  get_prior_reviews: handleGetPriorReviews,
  get_case_audit: handleGetCaseAudit,
  // Compute
  compute_rule_hits: handleComputeRuleHits,
  compute_risk_signals: handleComputeRiskSignals,
  build_evidence_bundle: handleBuildEvidenceBundle,
  draft_case_summary: handleDraftCaseSummary,
  check_policy: handleCheckPolicy,
  // Action
  submit_review: handleSubmitReview,
  request_escalation: handleRequestEscalation,
  suspend_agent: handleSuspendAgent,
  revoke_agent: handleRevokeAgent,
}

const TOOL_DEFINITIONS = [
  // ─── Read tools ─────────────────────────────────────────────────────────────
  {
    name: 'get_case',
    description: 'Retrieve a case record by case ID.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
      },
      required: ['actor', 'case_id'],
    },
  },
  {
    name: 'get_alert',
    description: 'Retrieve an alert record with its associated transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        alert_id: { type: 'string', description: 'Alert ID' },
      },
      required: ['actor', 'alert_id'],
    },
  },
  {
    name: 'get_customer_profile',
    description: 'Retrieve customer and account context for a given case.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
      },
      required: ['actor', 'case_id'],
    },
  },
  {
    name: 'get_account_context',
    description: 'Retrieve account context with 30-day transaction summary.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
      },
      required: ['actor', 'case_id'],
    },
  },
  {
    name: 'get_merchant_context',
    description: 'Retrieve merchant context and prior alert count for a case.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
      },
      required: ['actor', 'case_id'],
    },
  },
  {
    name: 'get_recent_transactions',
    description: 'Retrieve recent transactions for the account associated with a case.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
        limit: { type: 'number', description: 'Max results (1–100, default 20)' },
        days: { type: 'number', description: 'Lookback window in days (1–90, default 30)' },
      },
      required: ['actor', 'case_id'],
    },
  },
  {
    name: 'get_prior_alerts',
    description: 'Retrieve prior alerts on the same account, excluding the current alert.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
        limit: { type: 'number', description: 'Max results (1–50, default 10)' },
      },
      required: ['actor', 'case_id'],
    },
  },
  {
    name: 'get_prior_reviews',
    description: 'Retrieve prior reviews on cases from the same account.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
        limit: { type: 'number', description: 'Max results (1–20, default 10)' },
      },
      required: ['actor', 'case_id'],
    },
  },
  {
    name: 'get_case_audit',
    description: 'Retrieve the full audit trail for a case, ordered chronologically.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
      },
      required: ['actor', 'case_id'],
    },
  },
  // ─── Compute tools ──────────────────────────────────────────────────────────
  {
    name: 'compute_rule_hits',
    description: 'Evaluate 7 risk rules against the case transaction and write risk_signals records.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
      },
      required: ['actor', 'case_id'],
    },
  },
  {
    name: 'compute_risk_signals',
    description: 'Read existing risk signals and compute a composite score (0–100).',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
      },
      required: ['actor', 'case_id'],
    },
  },
  {
    name: 'build_evidence_bundle',
    description: 'Assemble a structured evidence bundle from signals, entities, and summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
      },
      required: ['actor', 'case_id'],
    },
  },
  {
    name: 'draft_case_summary',
    description: 'Generate a case narrative summary and recommendation using Claude.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
        evidence_id: { type: 'string', description: 'Evidence record ID to summarize from' },
      },
      required: ['actor', 'case_id', 'evidence_id'],
    },
  },
  {
    name: 'check_policy',
    description: 'Evaluate policy for a proposed action on a case.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
        proposed_action: { type: 'string', description: 'The action being evaluated' },
        agent_id: { type: 'string', description: 'Optional agent ID override' },
      },
      required: ['actor', 'case_id', 'proposed_action'],
    },
  },
  // ─── Action tools ───────────────────────────────────────────────────────────
  {
    name: 'submit_review',
    description: 'Submit a human review decision. Requires reason_code if override_flag is true.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
        reviewer_id: { type: 'string', description: 'Reviewer identity' },
        final_action: { type: 'string', enum: ['approved', 'overridden', 'escalated', 'requested_context'] },
        override_flag: { type: 'boolean', description: 'True if overriding the recommendation' },
        reason_code: { type: 'string', description: 'Required when override_flag is true' },
        notes: { type: 'string', description: 'Optional reviewer notes' },
      },
      required: ['actor', 'case_id', 'reviewer_id', 'final_action', 'override_flag'],
    },
  },
  {
    name: 'request_escalation',
    description: 'Escalate a case to a higher-tier team.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        case_id: { type: 'string', description: 'Case ID' },
        requesting_reviewer_id: { type: 'string', description: 'Reviewer requesting escalation' },
        escalation_reason: { type: 'string', description: 'Reason for escalation' },
        target_team: { type: 'string', description: 'Optional target team identifier' },
      },
      required: ['actor', 'case_id', 'requesting_reviewer_id', 'escalation_reason'],
    },
  },
  {
    name: 'suspend_agent',
    description: 'Suspend an agent (admin/platform-engineer only). Invalidates registry cache.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        agent_id: { type: 'string', description: 'Agent ID to suspend' },
        reason: { type: 'string', description: 'Reason for suspension' },
        suspended_by: { type: 'string', description: 'Identity of the operator suspending the agent' },
      },
      required: ['actor', 'agent_id', 'reason', 'suspended_by'],
    },
  },
  {
    name: 'revoke_agent',
    description: 'Permanently revoke an agent (irreversible). Returns error if already revoked.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'object', description: 'Calling actor identity' },
        agent_id: { type: 'string', description: 'Agent ID to revoke' },
        reason: { type: 'string', description: 'Reason for revocation' },
        revoked_by: { type: 'string', description: 'Identity of the operator revoking the agent' },
      },
      required: ['actor', 'agent_id', 'reason', 'revoked_by'],
    },
  },
]

export function registerTools(server: Server, registry: AgentRegistry): void {
  // List all tools
  server.setRequestHandler(ListToolsRequestSchema, async (_request, _extra) => {
    return { tools: TOOL_DEFINITIONS }
  })

  // Dispatch tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request, _extra) => {
    const { name, arguments: args } = request.params
    const handler = TOOL_HANDLERS[name]

    if (!handler) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
        isError: true,
      } as CallToolResult
    }

    const params = (args ?? {}) as Record<string, unknown>
    const response = await handler(params, registry)
    return toCallToolResult(response)
  })
}
