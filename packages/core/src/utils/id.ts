import { ulid } from 'ulid'

/**
 * Generate a prefixed ULID identifier.
 * @param prefix - e.g. 'case', 'alert', 'txn'
 * @returns e.g. 'case_01HXYZ...'
 */
export function generateId(prefix: string): string {
  return `${prefix}_${ulid()}`
}

/**
 * Validate that a string matches the prefixed ULID format.
 */
export function isValidId(value: string, expectedPrefix?: string): boolean {
  const parts = value.split('_')
  if (parts.length < 2) return false
  const prefix = parts.slice(0, -1).join('_')
  const id = parts[parts.length - 1]
  if (expectedPrefix !== undefined && prefix !== expectedPrefix) return false
  return /^[0-9A-Z]{26}$/.test(id ?? '')
}

// Typed ID generators for all domain entities
export const ids = {
  customer: () => generateId('customer'),
  account: () => generateId('account'),
  merchant: () => generateId('merchant'),
  transaction: () => generateId('txn'),
  alert: () => generateId('alert'),
  case: () => generateId('case'),
  signal: () => generateId('signal'),
  evidence: () => generateId('evidence'),
  recommendation: () => generateId('rec'),
  review: () => generateId('review'),
  agent: () => generateId('agent'),
  policyEvent: () => generateId('policy'),
  auditLog: () => generateId('audit'),
  workflowRun: () => generateId('run'),
  metricsSnapshot: () => generateId('metric'),
  correlationId: () => generateId('corr'),
} as const
