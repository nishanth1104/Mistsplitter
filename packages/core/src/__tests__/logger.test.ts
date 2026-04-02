import { describe, it, expect } from 'vitest'
import { redactSecrets } from '../logger.js'

describe('redactSecrets()', () => {
  it('redacts password field', () => {
    const result = redactSecrets({ password: 'mysecret123' })
    expect((result as Record<string, unknown>)['password']).toBe('[REDACTED]')
  })

  it('redacts apiKey field', () => {
    const result = redactSecrets({ apiKey: 'sk-ant-abc123' })
    expect((result as Record<string, unknown>)['apiKey']).toBe('[REDACTED]')
  })

  it('redacts token field', () => {
    const result = redactSecrets({ token: 'Bearer xyz' })
    expect((result as Record<string, unknown>)['token']).toBe('[REDACTED]')
  })

  it('redacts secret field', () => {
    const result = redactSecrets({ secret: 'supersecret' })
    expect((result as Record<string, unknown>)['secret']).toBe('[REDACTED]')
  })

  it('redacts authorization field', () => {
    const result = redactSecrets({ authorization: 'Bearer token' })
    expect((result as Record<string, unknown>)['authorization']).toBe('[REDACTED]')
  })

  it('redacts access_token field', () => {
    const result = redactSecrets({ access_token: 'abc' })
    expect((result as Record<string, unknown>)['access_token']).toBe('[REDACTED]')
  })

  it('redacts private_key field', () => {
    const result = redactSecrets({ private_key: 'BEGIN RSA...' })
    expect((result as Record<string, unknown>)['private_key']).toBe('[REDACTED]')
  })

  it('preserves non-secret fields', () => {
    const result = redactSecrets({ userId: 'user_123', action: 'login', amount: 100 })
    const r = result as Record<string, unknown>
    expect(r['userId']).toBe('user_123')
    expect(r['action']).toBe('login')
    expect(r['amount']).toBe(100)
  })

  it('redacts secrets inside nested objects', () => {
    const result = redactSecrets({
      user: { id: 'u1', password: 'secret' },
      meta: { token: 'xyz' },
    })
    const r = result as Record<string, Record<string, unknown>>
    expect(r['user']?.['password']).toBe('[REDACTED]')
    expect(r['meta']?.['token']).toBe('[REDACTED]')
    expect(r['user']?.['id']).toBe('u1')
  })

  it('redacts secrets inside arrays', () => {
    const result = redactSecrets([{ password: 'p1' }, { name: 'alice' }])
    const r = result as Record<string, unknown>[]
    expect(r[0]?.['password']).toBe('[REDACTED]')
    expect(r[1]?.['name']).toBe('alice')
  })

  it('passes through primitives unchanged', () => {
    expect(redactSecrets('hello')).toBe('hello')
    expect(redactSecrets(42)).toBe(42)
    expect(redactSecrets(null)).toBeNull()
    expect(redactSecrets(true)).toBe(true)
  })

  it('does not mutate the original object', () => {
    const original = { password: 'secret', name: 'alice' }
    redactSecrets(original)
    expect(original.password).toBe('secret')
  })
})
