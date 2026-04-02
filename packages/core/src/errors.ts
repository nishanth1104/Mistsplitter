/**
 * Centralized error types for the Mistsplitter platform.
 * These are domain errors — not HTTP errors.
 */

export class MistsplitterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'MistsplitterError'
  }
}

export class NotFoundError extends MistsplitterError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends MistsplitterError {
  constructor(
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class PermissionDeniedError extends MistsplitterError {
  constructor(actor: string, action: string, reason?: string) {
    super(
      `Permission denied: ${actor} cannot perform ${action}${reason ? ` — ${reason}` : ''}`,
      'PERMISSION_DENIED',
    )
    this.name = 'PermissionDeniedError'
  }
}

export class PolicyBlockedError extends MistsplitterError {
  constructor(rationale: string) {
    super(`Action blocked by policy: ${rationale}`, 'POLICY_BLOCKED')
    this.name = 'PolicyBlockedError'
  }
}

export class InvalidStateTransitionError extends MistsplitterError {
  constructor(from: string, event: string) {
    super(`Invalid state transition: ${from} + ${event}`, 'INVALID_STATE_TRANSITION')
    this.name = 'InvalidStateTransitionError'
  }
}

export class LLMValidationError extends MistsplitterError {
  constructor(details: string) {
    super(`LLM output failed validation: ${details}`, 'LLM_VALIDATION_ERROR')
    this.name = 'LLMValidationError'
  }
}

export class AgentScopeError extends MistsplitterError {
  constructor(agentId: string, toolName: string) {
    super(`Agent ${agentId} is not permitted to call tool: ${toolName}`, 'AGENT_SCOPE_ERROR')
    this.name = 'AgentScopeError'
  }
}

export class DuplicateError extends MistsplitterError {
  constructor(resource: string, key: string) {
    super(`${resource} already exists: ${key}`, 'DUPLICATE_ERROR')
    this.name = 'DuplicateError'
  }
}
