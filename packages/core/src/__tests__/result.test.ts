import { describe, it, expect } from 'vitest'
import { ok, err, isOk, isErr, unwrap, mapOk, mapErr, type Result } from '../utils/result.js'

describe('Result<T, E>', () => {
  describe('ok()', () => {
    it('creates an Ok result with the given value', () => {
      const result = ok(42)
      expect(result.ok).toBe(true)
      expect(result.value).toBe(42)
    })

    it('works with string values', () => {
      const result = ok('hello')
      expect(result.ok).toBe(true)
      expect(result.value).toBe('hello')
    })

    it('works with object values', () => {
      const result = ok({ id: 'case_123', status: 'pending' })
      expect(result.ok).toBe(true)
      expect(result.value).toEqual({ id: 'case_123', status: 'pending' })
    })

    it('works with null value', () => {
      const result = ok(null)
      expect(result.ok).toBe(true)
      expect(result.value).toBeNull()
    })
  })

  describe('err()', () => {
    it('creates an Err result with the given error', () => {
      const result = err('something went wrong')
      expect(result.ok).toBe(false)
      expect(result.error).toBe('something went wrong')
    })

    it('works with object errors', () => {
      const error = { code: 'NOT_FOUND', message: 'Case not found' }
      const result = err(error)
      expect(result.ok).toBe(false)
      expect(result.error).toEqual(error)
    })
  })

  describe('isOk()', () => {
    it('returns true for Ok results', () => {
      expect(isOk(ok(1))).toBe(true)
    })
    it('returns false for Err results', () => {
      expect(isOk(err('error'))).toBe(false)
    })
    it('narrows type correctly', () => {
      const result: Result<number, string> = ok(42)
      if (isOk(result)) {
        // TypeScript should know result.value is number here
        expect(result.value).toBe(42)
      }
    })
  })

  describe('isErr()', () => {
    it('returns true for Err results', () => {
      expect(isErr(err('oops'))).toBe(true)
    })
    it('returns false for Ok results', () => {
      expect(isErr(ok(42))).toBe(false)
    })
    it('narrows type correctly', () => {
      const result: Result<number, string> = err('bad')
      if (isErr(result)) {
        // TypeScript should know result.error is string here
        expect(result.error).toBe('bad')
      }
    })
  })

  describe('unwrap()', () => {
    it('returns value for Ok', () => {
      expect(unwrap(ok(99))).toBe(99)
    })
    it('throws for Err', () => {
      expect(() => unwrap(err('fail'))).toThrow('Unwrap failed')
    })
  })

  describe('mapOk()', () => {
    it('transforms the Ok value', () => {
      const result = mapOk(ok(2), (x) => x * 3)
      expect(result).toEqual(ok(6))
    })
    it('passes through Err unchanged', () => {
      const result = mapOk(err('bad') as Result<number, string>, (x) => x * 3)
      expect(result).toEqual(err('bad'))
    })
  })

  describe('mapErr()', () => {
    it('transforms the Err value', () => {
      const result = mapErr(err('low-level'), (e) => `Wrapped: ${e}`)
      expect(result).toEqual(err('Wrapped: low-level'))
    })
    it('passes through Ok unchanged', () => {
      const result = mapErr(ok(42) as Result<number, string>, (e) => `Wrapped: ${e}`)
      expect(result).toEqual(ok(42))
    })
  })
})
