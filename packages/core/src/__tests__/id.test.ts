import { describe, it, expect } from 'vitest'
import { generateId, isValidId, ids } from '../utils/id.js'

describe('generateId()', () => {
  it('returns a string with the correct prefix', () => {
    const id = generateId('case')
    expect(id).toMatch(/^case_[0-9A-Z]{26}$/)
  })

  it('returns a string with multi-word prefix', () => {
    const id = generateId('workflow_run')
    expect(id).toMatch(/^workflow_run_[0-9A-Z]{26}$/)
  })

  it('generates unique IDs on every call', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('test')))
    expect(ids.size).toBe(100)
  })

  it('generates a valid ULID suffix (26 uppercase base-32 chars)', () => {
    const id = generateId('x')
    const suffix = id.split('_')[1]
    expect(suffix).toMatch(/^[0-9A-Z]{26}$/)
  })
})

describe('isValidId()', () => {
  it('returns true for valid prefixed ULID', () => {
    const id = generateId('case')
    expect(isValidId(id)).toBe(true)
  })

  it('returns true when prefix matches', () => {
    const id = generateId('case')
    expect(isValidId(id, 'case')).toBe(true)
  })

  it('returns false when prefix does not match', () => {
    const id = generateId('alert')
    expect(isValidId(id, 'case')).toBe(false)
  })

  it('returns false for plain string without prefix', () => {
    expect(isValidId('01HXYZ9K2P3Q4R5S6T7U8V9W0A')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidId('')).toBe(false)
  })

  it('returns false for malformed ULID', () => {
    expect(isValidId('case_not-a-valid-ulid')).toBe(false)
  })
})

describe('ids typed generators', () => {
  it('generates case IDs with case_ prefix', () => {
    expect(ids.case()).toMatch(/^case_[0-9A-Z]{26}$/)
  })

  it('generates alert IDs with alert_ prefix', () => {
    expect(ids.alert()).toMatch(/^alert_[0-9A-Z]{26}$/)
  })

  it('generates transaction IDs with txn_ prefix', () => {
    expect(ids.transaction()).toMatch(/^txn_[0-9A-Z]{26}$/)
  })

  it('generates correlation IDs with corr_ prefix', () => {
    expect(ids.correlationId()).toMatch(/^corr_[0-9A-Z]{26}$/)
  })

  it('all generators produce different IDs', () => {
    const generated = [
      ids.customer(), ids.account(), ids.merchant(), ids.transaction(),
      ids.alert(), ids.case(), ids.signal(), ids.evidence(),
      ids.recommendation(), ids.review(), ids.agent(), ids.policyEvent(),
      ids.auditLog(), ids.workflowRun(), ids.metricsSnapshot(),
    ]
    const unique = new Set(generated)
    expect(unique.size).toBe(generated.length)
  })
})
